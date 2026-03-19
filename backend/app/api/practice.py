"""Practice testing agent — structured review tests with spaced repetition."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException

from pydantic import BaseModel

from app.agent.prompts import PRACTICE_GENERATE_PROMPT, PRACTICE_SCORING_PROMPT
from app.config import PLANS_DIR, get_config, get_llm
from app.db import mongo
from app.memory import evermemos
from app.plan_parser import parse_plan
from app.services.mastery import get_tier, update_concept_mastery

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/practice", tags=["practice"])


# ---------------------------------------------------------------------------
# Question count per mastery tier
# ---------------------------------------------------------------------------

TIER_QUESTION_COUNT = {"weak": 4, "medium": 5, "strong": 4, "mastered": 3}


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM output that may be wrapped in markdown fences."""
    # Strip markdown code fences if present
    m = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    raw = m.group(1).strip() if m else text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Failed to parse LLM JSON output: %s", raw[:500])
        return {}


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    concept_name: str
    topic_slug: str
    user_id: str = "user_001"


class SubmitRequest(BaseModel):
    test_id: str
    answers: list[dict]  # [{"question_id": "q1", "answer": "B"}, ...]


class PollRequest(BaseModel):
    user_id: str = "user_001"


# ---------------------------------------------------------------------------
# GET /api/practice/topics — list testable concepts grouped by topic
# ---------------------------------------------------------------------------


@router.get("/topics")
async def get_testable_topics(user_id: str = "user_001"):
    """Return completed concepts from all plans, grouped by topic_slug."""
    topics: list[dict] = []

    if not PLANS_DIR.exists():
        return {"topics": topics}

    for plan_dir in sorted(PLANS_DIR.iterdir()):
        plan_path = plan_dir / "plan.md"
        if not plan_path.exists():
            continue

        tree = parse_plan(plan_path.read_text())
        completed = []
        for phase in tree.phases:
            for concept in phase.concepts:
                if concept.completed:
                    # Look up mastery if available
                    mastery_doc = mongo.concept_mastery().find_one(
                        {"user_id": user_id, "concept_name": concept.name}
                    )
                    score = mastery_doc["mastery_score"] if mastery_doc else None
                    tier = get_tier(score)[0] if score is not None else None
                    completed.append(
                        {
                            "name": concept.name,
                            "mastery_score": score,
                            "mastery_tier": tier,
                        }
                    )

        if completed:
            topics.append(
                {
                    "topic_slug": plan_dir.name,
                    "topic_name": tree.topic or plan_dir.name,
                    "concepts": completed,
                }
            )

    return {"topics": topics}


# ---------------------------------------------------------------------------
# GET /api/practice/pending — list scheduled tests due now
# ---------------------------------------------------------------------------


@router.get("/pending")
async def get_pending_tests(user_id: str = "user_001"):
    """Return ReviewSchedule records that are pending and due."""
    now = datetime.now(timezone.utc)
    cursor = mongo.review_schedule().find(
        {
            "user_id": user_id,
            "status": {"$in": ["pending", "triggered"]},
            "scheduled_for": {"$lte": now},
        },
        sort=[("scheduled_for", 1)],
    )

    tests = []
    for doc in cursor:
        concept_name = doc["concept_id"]
        mastery_doc = mongo.concept_mastery().find_one(
            {"user_id": user_id, "concept_name": concept_name}
        )
        score = mastery_doc["mastery_score"] if mastery_doc else 0.0
        tier_name = get_tier(score)[0]

        tests.append(
            {
                "id": str(doc["_id"]),
                "concept_name": concept_name,
                "topic_slug": doc.get("topic_slug", ""),
                "scheduled_for": doc["scheduled_for"].isoformat(),
                "status": doc["status"],
                "mastery_score": score,
                "mastery_tier": tier_name,
            }
        )

    return {"tests": tests}


# ---------------------------------------------------------------------------
# POST /api/practice/generate — generate a structured test
# ---------------------------------------------------------------------------


@router.post("/generate")
async def generate_test(req: GenerateRequest):
    """Generate a structured questionnaire for a concept."""
    # 1. Load plan and find the concept
    plan_path = PLANS_DIR / req.topic_slug / "plan.md"
    if not plan_path.exists():
        raise HTTPException(status_code=404, detail="Plan not found")

    tree = parse_plan(plan_path.read_text())

    # Find concept in plan
    target_concept = None
    concept_context_parts: list[str] = []
    for phase in tree.phases:
        for concept in phase.concepts:
            if concept.name.lower() == req.concept_name.lower():
                target_concept = concept
            concept_context_parts.append(
                f"{'[x]' if concept.completed else '[ ]'} {concept.name} — {concept.description}"
            )

    if target_concept is None:
        raise HTTPException(status_code=404, detail="Concept not found in plan")

    if not target_concept.completed:
        return {
            "error": "concept_not_learned",
            "concept_name": req.concept_name,
            "message": "You haven't covered this concept yet. Learn it with Mr. Feynman first.",
        }

    # 2. Search EverMemOS for what the user knows
    memory_context = "No prior memories found."
    try:
        mem_resp = await evermemos.search_memories(
            user_id=req.user_id,
            query=f"user's understanding of {req.concept_name}",
            retrieve_method="rrf",
            top_k=10,
        )
        memories = mem_resp.get("result", {}).get("memories", [])
        if memories:
            memory_context = "\n".join(
                f"- {(m.get('content') or m.get('summary') or m.get('episode') or '')[:300]}"
                for m in memories
            )
    except Exception as e:
        logger.warning("EverMemOS search failed: %s", e)

    # 3. Load mastery data
    mastery_doc = mongo.concept_mastery().find_one(
        {"user_id": req.user_id, "concept_name": req.concept_name}
    )
    mastery_score = mastery_doc["mastery_score"] if mastery_doc else 0.0
    tier_name = get_tier(mastery_score)[0]
    weak_subconcepts = mastery_doc.get("weak_subconcepts", []) if mastery_doc else []
    num_questions = TIER_QUESTION_COUNT.get(tier_name, 4)

    # 4. Build prompt and call LLM
    prompt = PRACTICE_GENERATE_PROMPT.format(
        concept_name=req.concept_name,
        concept_description=target_concept.description or req.concept_name,
        plan_context="\n".join(concept_context_parts[:20]),
        memory_context=memory_context,
        mastery_tier=tier_name,
        mastery_score=round(mastery_score, 2),
        weak_subconcepts=", ".join(weak_subconcepts) if weak_subconcepts else "none",
        num_questions=num_questions,
    )

    response = await get_llm().chat.completions.create(
        model=get_config().scoring_model,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": "Generate the test questions now. Output ONLY the JSON object."},
        ],
        max_tokens=2000,
    )

    raw = response.choices[0].message.content or "{}"
    questions = _extract_json(raw).get("questions", [])

    # 5. Save as TestResult with status="in_progress"
    doc = {
        "user_id": req.user_id,
        "concept_id": req.concept_name,
        "topic_slug": req.topic_slug,
        "test_type": "practice",
        "status": "in_progress",
        "questions": questions,
        "answers": [],
        "per_question_results": [],
        "scores": {"clarity": 0.0, "accuracy": 0.0, "depth": 0.0, "transferability": 0.0},
        "overall_score": 0.0,
        "feedback": "",
        "question": "",
        "user_response": "",
        "strong_topics": [],
        "weak_areas": [],
        "missed_topics": [],
        "improvements": [],
        "hint_ids": [],
        "created_at": datetime.now(timezone.utc),
    }
    result = mongo.test_results().insert_one(doc)

    # 6. Mark ReviewSchedule as triggered if one exists for this concept
    mongo.review_schedule().update_many(
        {
            "user_id": req.user_id,
            "concept_id": req.concept_name,
            "status": "pending",
        },
        {"$set": {"status": "triggered", "triggered_at": datetime.now(timezone.utc)}},
    )

    return {
        "test_id": str(result.inserted_id),
        "concept_name": req.concept_name,
        "questions": [
            {
                "id": q.get("id"),
                "type": q.get("type"),
                "question": q.get("question"),
                "options": q.get("options"),
                "explanation_hint": q.get("explanation_hint"),
            }
            for q in questions
        ],
    }


# ---------------------------------------------------------------------------
# POST /api/practice/submit — score answers and update mastery
# ---------------------------------------------------------------------------


@router.post("/submit")
async def submit_test(req: SubmitRequest):
    """Score test answers, update mastery, schedule next review."""
    # 1. Load the test — atomically claim it to prevent double submission
    test_doc = mongo.test_results().find_one_and_update(
        {"_id": ObjectId(req.test_id), "status": "in_progress"},
        {"$set": {"status": "scoring"}},
    )
    if not test_doc:
        # Either doesn't exist or already submitted
        exists = mongo.test_results().find_one({"_id": ObjectId(req.test_id)})
        if not exists:
            raise HTTPException(status_code=404, detail="Test not found")
        raise HTTPException(status_code=400, detail="Test already submitted")

    concept_name = test_doc["concept_id"]
    user_id = test_doc["user_id"]
    topic_slug = test_doc.get("topic_slug", "")
    questions = test_doc.get("questions", [])

    # Build a mapping of answers
    answer_map = {a["question_id"]: a["answer"] for a in req.answers}

    # 2. Format questions and answers for scoring
    qa_parts = []
    for q in questions:
        qid = q.get("id", "")
        user_answer = answer_map.get(qid, "(no answer)")
        qa_parts.append(
            f"Question ({q.get('type', 'unknown')}): {q.get('question', '')}\n"
            f"Correct answer: {q.get('correct_answer', 'N/A')}\n"
            f"User's answer: {user_answer}"
        )

    # 3. Gather memory context
    memory_context = "No memories available."
    try:
        mem_resp = await evermemos.search_memories(
            user_id=user_id,
            query=f"user's understanding of {concept_name}",
            retrieve_method="rrf",
            top_k=10,
        )
        memories = mem_resp.get("result", {}).get("memories", [])
        if memories:
            memory_context = "\n".join(
                f"- {(m.get('content') or m.get('summary') or m.get('episode') or '')[:300]}"
                for m in memories
            )
    except Exception as e:
        logger.warning("EverMemOS search failed during scoring: %s", e)

    # 4. Call LLM for scoring
    scoring_prompt = PRACTICE_SCORING_PROMPT.format(
        concept_name=concept_name,
        memory_context=memory_context,
        questions_and_answers="\n\n".join(qa_parts),
    )

    response = await get_llm().chat.completions.create(
        model=get_config().scoring_model,
        messages=[
            {"role": "system", "content": scoring_prompt},
            {"role": "user", "content": "Score the answers now. Output ONLY the JSON object."},
        ],
        max_tokens=2000,
    )

    scores = _extract_json(response.choices[0].message.content or "{}")

    # 5. Extract scores
    per_question = scores.get("per_question", [])
    overall_score = scores.get("overall_score", 0.0)
    weak_areas = scores.get("weak_areas", [])

    # 6. Mark ReviewSchedule as completed
    mongo.review_schedule().update_many(
        {
            "user_id": user_id,
            "concept_id": concept_name,
            "status": "triggered",
        },
        {
            "$set": {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc),
                "result_score": overall_score,
            }
        },
    )

    # 7. Update mastery and schedule next review
    mastery_update = update_concept_mastery(
        user_id=user_id,
        concept_name=concept_name,
        topic_slug=topic_slug,
        overall_score=overall_score,
        weak_areas=weak_areas,
    )

    # 8. Persist scores + mastery on the test result (single write)
    mongo.test_results().update_one(
        {"_id": ObjectId(req.test_id)},
        {
            "$set": {
                "answers": req.answers,
                "per_question_results": per_question,
                "scores": {
                    "clarity": scores.get("clarity", 0.0),
                    "accuracy": scores.get("accuracy", 0.0),
                    "depth": scores.get("depth", 0.0),
                    "transferability": scores.get("transferability", 0.0),
                },
                "overall_score": overall_score,
                "feedback": scores.get("feedback", ""),
                "weak_areas": weak_areas,
                "improvements": scores.get("improvements", []),
                "mastery_update": mastery_update,
                "status": "scored",
            }
        },
    )

    # 8. Store observation in EverMemOS
    try:
        practice_group = f"practice_{user_id}"
        await evermemos.ensure_conversation_meta(
            group_id=practice_group, user_id=user_id,
        )
        weak_str = ", ".join(weak_areas) if weak_areas else "none"
        await evermemos.store_memory(
            message_id=req.test_id,
            content=(
                f"Practice review test on '{concept_name}': "
                f"scored {overall_score:.2f}/1.0. "
                f"Weak areas: {weak_str}. "
                f"New mastery: {mastery_update['new_score']:.2f} ({mastery_update['tier']}). "
                f"Next review: {mastery_update['next_review']}"
            ),
            sender=user_id,
            group_id=practice_group,
            role="assistant",
            sender_name="Practice",
        )
    except Exception as e:
        logger.warning("Failed to store test result in EverMemOS: %s", e)

    return {
        "test_id": req.test_id,
        "overall_score": overall_score,
        "scores": {
            "clarity": scores.get("clarity", 0.0),
            "accuracy": scores.get("accuracy", 0.0),
            "depth": scores.get("depth", 0.0),
            "transferability": scores.get("transferability", 0.0),
        },
        "per_question": per_question,
        "feedback": scores.get("feedback", ""),
        "weak_areas": weak_areas,
        "mastery_update": mastery_update,
    }


# ---------------------------------------------------------------------------
# GET /api/practice/history — test history
# ---------------------------------------------------------------------------


@router.get("/history")
async def get_test_history(user_id: str = "user_001", limit: int = 20):
    """Return recent Practice test results."""
    cursor = mongo.test_results().find(
        {"user_id": user_id, "test_type": "practice", "status": "scored"},
        sort=[("created_at", -1)],
        limit=limit,
    )

    results = []
    for doc in cursor:
        results.append(
            {
                "id": str(doc["_id"]),
                "concept_name": doc.get("concept_id", ""),
                "topic_slug": doc.get("topic_slug", ""),
                "overall_score": doc.get("overall_score", 0.0),
                "scores": doc.get("scores", {}),
                "feedback": doc.get("feedback", ""),
                "created_at": doc.get("created_at", ""),
            }
        )

    return {"results": results}


# ---------------------------------------------------------------------------
# POST /api/practice/poll — manual foresight poll trigger (dev/testing)
# ---------------------------------------------------------------------------


@router.post("/poll")
async def trigger_poll(req: PollRequest):
    """Manually trigger a foresight poll (for development/testing)."""
    from app.services.foresight_poller import poll_foresights

    created = await poll_foresights(req.user_id)
    return {"status": "ok", "schedules_created": created}
