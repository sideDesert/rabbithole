from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import LLM_API_KEY, LLM_BASE_URL, DEFAULT_MODEL
from app.db import mongo
from app.memory import evermemos

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feynman", tags=["feynman"])

_oai = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)
MODEL = DEFAULT_MODEL


# ── Request / Response schemas ──────────────────────────────────────

class HintRequest(BaseModel):
    thread_id: str
    concept_name: str
    current_content: str | None = None


class HintResponse(BaseModel):
    hint: str
    hint_id: str


class SubmitRequest(BaseModel):
    thread_id: str
    concept_name: str
    markdown: str
    hint_ids: list[str] = []


class SubmitResponse(BaseModel):
    submission_id: str
    status: str


# ── Hint endpoint ───────────────────────────────────────────────────

@router.post("/hint", response_model=HintResponse)
async def get_hint(req: HintRequest) -> HintResponse:
    """Generate a nudge hint for the learner without giving away the answer."""

    # Build context from conversation history
    messages_cursor = mongo.messages().find(
        {"thread_id": req.thread_id},
        sort=[("index", 1)],
    )
    conversation = []
    for msg in messages_cursor:
        conversation.append(f"{msg['role']}: {msg['content'][:500]}")
    conv_context = "\n".join(conversation[-20:])  # last 20 messages

    draft_context = ""
    if req.current_content:
        draft_context = f"\n\nThe learner's current draft:\n{req.current_content}"

    system_prompt = (
        "You are a learning assistant. The learner is trying to explain a concept "
        "in their own words (Feynman technique). They need a subtle hint — a nudge "
        "about what to think about next, WITHOUT giving away the answer.\n\n"
        "Rules:\n"
        "- One sentence only\n"
        "- Point toward a direction, not the answer\n"
        "- If they have a draft, hint about something they haven't covered yet\n"
        "- Be encouraging but not patronizing\n\n"
        f"Concept: {req.concept_name}\n\n"
        f"Recent conversation context:\n{conv_context}"
        f"{draft_context}"
    )

    response = await _oai.chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": system_prompt}],
        max_tokens=100,
    )
    hint_text = response.choices[0].message.content or "Think about the key relationships."

    # Log to MongoDB
    hint_doc = {
        "thread_id": req.thread_id,
        "concept_name": req.concept_name,
        "hint_text": hint_text,
        "timestamp": datetime.now(timezone.utc),
    }
    result = mongo.feynman_hints().insert_one(hint_doc)

    return HintResponse(hint=hint_text, hint_id=str(result.inserted_id))


# ── Scoring background task ─────────────────────────────────────────

async def _score_feynman_submission(submission_id: str, req: SubmitRequest) -> None:
    """Background task: score a Feynman explanation via LLM."""
    try:
        # Gather context
        messages_cursor = mongo.messages().find(
            {"thread_id": req.thread_id},
            sort=[("index", 1)],
        )
        conversation = []
        for msg in messages_cursor:
            conversation.append(f"{msg['role']}: {msg['content'][:500]}")
        conv_context = "\n".join(conversation[-30:])

        # Gather hints used
        hints_context = ""
        if req.hint_ids:
            hint_docs = list(mongo.feynman_hints().find(
                {"_id": {"$in": [ObjectId(h) for h in req.hint_ids]}}
            ))
            hints_text = "\n".join(f"- {h['hint_text']}" for h in hint_docs)
            hints_context = f"\n\nHints the learner requested ({len(hint_docs)} total):\n{hints_text}"

        system_prompt = (
            "You are an expert learning evaluator. Score a learner's Feynman explanation.\n\n"
            "Score each dimension 0.0-1.0:\n"
            "- clarity: How clear and well-organized is the explanation?\n"
            "- accuracy: Is the content factually correct?\n"
            "- depth: Does it go beyond surface-level?\n"
            "- transferability: Could someone learn from this explanation?\n\n"
            "Also identify:\n"
            "- strong_topics: Topics explained well (list of strings)\n"
            "- weak_areas: Topics explained poorly or incorrectly (list of strings)\n"
            "- missed_topics: Topics from the teaching conversation NOT covered in the explanation (list of strings)\n"
            "- improvements: Specific actionable suggestions (list of strings)\n"
            "- feedback: A 2-3 sentence overall assessment\n"
            "- overall_score: Weighted average of the 4 dimensions (0.0-1.0)\n\n"
            f"Concept: {req.concept_name}\n\n"
            f"Teaching conversation:\n{conv_context}"
            f"{hints_context}\n\n"
            f"Learner's explanation:\n{req.markdown}"
        )

        response = await _oai.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": system_prompt}],
            response_format={"type": "json_object"},
            max_tokens=1000,
        )

        scores = json.loads(response.choices[0].message.content or "{}")

        mongo.test_results().update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {
                "scores": {
                    "clarity": scores.get("clarity", 0.0),
                    "accuracy": scores.get("accuracy", 0.0),
                    "depth": scores.get("depth", 0.0),
                    "transferability": scores.get("transferability", 0.0),
                },
                "overall_score": scores.get("overall_score", 0.0),
                "feedback": scores.get("feedback", ""),
                "strong_topics": scores.get("strong_topics", []),
                "weak_areas": scores.get("weak_areas", []),
                "missed_topics": scores.get("missed_topics", []),
                "improvements": scores.get("improvements", []),
                "status": "scored",
            }},
        )

        # Update concept mastery with the scored result
        from app.services.mastery import update_concept_mastery
        thread = mongo.threads().find_one({"_id": req.thread_id})
        if thread:
            mastery_result = update_concept_mastery(
                user_id=str(thread["user_id"]),
                concept_name=req.concept_name,
                topic_slug=str(thread.get("topic_slug", "")),
                overall_score=scores.get("overall_score", 0.0),
                weak_areas=scores.get("weak_areas", []),
            )
            # Store mastery update alongside the test result
            mongo.test_results().update_one(
                {"_id": ObjectId(submission_id)},
                {"$set": {"mastery_update": mastery_result}},
            )

            # Store Feynman results in EverMemOS
            try:
                weak_str = ", ".join(scores.get("weak_areas", [])) or "none"
                await evermemos.store_memory(
                    message_id=submission_id,
                    content=(
                        f"Feynman explanation test on '{req.concept_name}': "
                        f"scored {scores.get('overall_score', 0.0):.2f}/1.0. "
                        f"Weak areas: {weak_str}. "
                        f"New mastery: {mastery_result['new_score']:.2f} ({mastery_result['tier']}). "
                        f"Next review: {mastery_result['next_review']}"
                    ),
                    sender=str(thread["user_id"]),
                    group_id=f"feynman_{thread['user_id']}",
                    role="assistant",
                    sender_name="Feynman",
                )
            except Exception as e:
                logger.warning("Failed to store Feynman result in EverMemOS: %s", e)
    except Exception:
        mongo.test_results().update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {"status": "failed"}},
        )


# ── Submit endpoint ─────────────────────────────────────────────────

@router.post("/submit", response_model=SubmitResponse, status_code=202)
async def submit_explanation(req: SubmitRequest) -> SubmitResponse:
    """Submit a Feynman explanation for async scoring."""

    # Look up thread to get user_id
    thread = mongo.threads().find_one({"_id": req.thread_id})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Save submission as test_result with status=scoring
    doc = {
        "user_id": thread["user_id"],
        "concept_id": req.concept_name,
        "thread_id": req.thread_id,
        "test_type": "feynman",
        "question": f"Explain: {req.concept_name}",
        "user_response": req.markdown,
        "scores": {"clarity": 0.0, "accuracy": 0.0, "depth": 0.0, "transferability": 0.0},
        "overall_score": 0.0,
        "feedback": "",
        "status": "scoring",
        "strong_topics": [],
        "weak_areas": [],
        "missed_topics": [],
        "improvements": [],
        "hint_ids": req.hint_ids,
        "created_at": datetime.now(timezone.utc),
    }
    result = mongo.test_results().insert_one(doc)
    submission_id = str(result.inserted_id)

    # Also save as a message in the conversation (save_message is synchronous)
    from app.api.chat import save_message
    last_msg = mongo.messages().find_one(
        {"thread_id": req.thread_id},
        sort=[("index", -1)],
    )
    next_index = (last_msg["index"] + 1) if last_msg else 0
    save_message(
        user_id=thread["user_id"],
        thread_id=req.thread_id,
        role="user",
        content=req.markdown,
        msg_type="feynman_input",
        group_id=str(thread.get("evermemos_group_id", req.thread_id)),
        index=next_index,
    )

    # Kick off background scoring
    asyncio.create_task(_score_feynman_submission(submission_id, req))

    return SubmitResponse(submission_id=submission_id, status="scoring")


@router.get("/result/{submission_id}")
async def get_feynman_result(submission_id: str):
    """Poll for Feynman test scoring result."""
    doc = mongo.test_results().find_one({"_id": ObjectId(submission_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Submission not found")

    return {
        "submission_id": submission_id,
        "status": doc.get("status", "scoring"),
        "scores": doc.get("scores"),
        "overall_score": doc.get("overall_score", 0.0),
        "feedback": doc.get("feedback", ""),
        "strong_topics": doc.get("strong_topics", []),
        "weak_areas": doc.get("weak_areas", []),
        "missed_topics": doc.get("missed_topics", []),
        "improvements": doc.get("improvements", []),
        "mastery_update": doc.get("mastery_update"),
    }
