"""Extract concepts and relationships from teaching conversations.

Called as a background task when teaching tools fire (update_plan_progress,
trigger_feynman, suggest_branches). Idempotent — safe to call multiple
times on the same thread.
"""

import json
import logging
from datetime import datetime, timezone



from app.config import get_config, get_llm
from app.db import mongo
from app.models.base import new_object_id

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """\
You are analyzing a learning conversation. Extract structured information about \
what concepts the learner engaged with and how they connected.

Given the conversation, return a JSON object with:

1. "concepts": array of objects, each with:
   - "name": string — concept name (use the plan's concept name if it matches)
   - "engagement": "surface" | "explained" | "applied"
     - surface: mentioned or briefly discussed
     - explained: learner explained it back or asked detailed questions
     - applied: learner used it to solve a problem or make connections

2. "confusions": array of objects, each with:
   - "concept_a": string — first concept name
   - "concept_b": string — second concept name
   - "note": string — brief description of the confusion

3. "trail": array of objects, each with:
   - "from": string — concept that led to exploration
   - "to": string — concept that was explored next

Return ONLY valid JSON. If nothing meaningful was discussed, return:
{"concepts": [], "confusions": [], "trail": []}
"""

MASTERY_DELTA = {
    "surface": 0.05,
    "explained": 0.15,
    "applied": 0.25,
}


async def extract_and_update_graph(
    thread_id: str, user_id: str, topic_slug: str
) -> None:
    """Extract concepts from recent messages and update the knowledge graph.

    Designed to run as a FastAPI background task. Errors are logged, not raised.
    """
    try:
        await _do_extraction(thread_id, user_id, topic_slug)
    except Exception as e:
        logger.error(
            "[extractor] failed for thread=%s: %s", thread_id, e, exc_info=True
        )


async def _do_extraction(
    thread_id: str, user_id: str, topic_slug: str
) -> None:
    # Load last N messages from this thread (skip tool calls)
    docs = list(
        mongo.messages()
        .find(
            {
                "thread_id": thread_id,
                "type": {"$in": ["text", "markdown"]},
            }
        )
        .sort("created_at", -1)
        .limit(20)
    )
    if len(docs) < 2:
        logger.info("[extractor] skipping thread=%s — too few messages", thread_id)
        return

    # Build transcript (oldest first)
    docs.reverse()
    transcript_lines = []
    for doc in docs:
        role = "Learner" if doc["role"] == "user" else "Teacher"
        content = str(doc.get("content", ""))
        if len(content) > 600:
            content = content[:600] + "..."
        transcript_lines.append(f"{role}: {content}")

    transcript = "\n".join(transcript_lines)

    # Call LLM for extraction
    llm = get_llm()
    response = await llm.chat.completions.create(
        model=get_config().default_model,
        messages=[
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": transcript},
        ],
        max_tokens=1000,
    )

    raw = response.choices[0].message.content or ""

    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]) if len(lines) > 2 else raw

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("[extractor] LLM returned invalid JSON: %s", raw[:200])
        return

    now = datetime.now(timezone.utc)
    concepts = data.get("concepts", [])
    confusions = data.get("confusions", [])
    trail = data.get("trail", [])

    logger.info(
        "[extractor] thread=%s extracted %d concepts, %d confusions, %d trail edges",
        thread_id,
        len(concepts),
        len(confusions),
        len(trail),
    )

    # Upsert concept nodes
    for c in concepts:
        name = c.get("name", "").strip()
        if not name:
            continue
        engagement = c.get("engagement", "surface")
        delta = MASTERY_DELTA.get(engagement, 0.05)

        existing = mongo.concept_mastery().find_one(
            {"user_id": user_id, "concept_name": name}
        )
        if existing:
            # Bump mastery by engagement delta (capped at 1.0)
            new_score = min(existing.get("mastery_score", 0.0) + delta, 1.0)
            mongo.concept_mastery().update_one(
                {"user_id": user_id, "concept_name": name},
                {
                    "$set": {
                        "mastery_score": new_score,
                        "updated_at": now,
                    }
                },
            )
        else:
            # New concept discovered in conversation
            mongo.concept_mastery().insert_one({
                "_id": new_object_id(),
                "user_id": user_id,
                "concept_name": name,
                "mastery_score": delta,
                "attempts": 0,
                "score_history": [],
                "strength_trend": "stable",
                "weak_subconcepts": [],
                "related_concepts": [],
                "domain": topic_slug,
                "source": "extracted",
                "confidence": 0.7,
                "description": "",
                "last_reviewed": now,
                "last_score": 0.0,
                "created_at": now,
                "updated_at": now,
            })

    # Upsert confusion edges
    for conf in confusions:
        a = conf.get("concept_a", "").strip()
        b = conf.get("concept_b", "").strip()
        if not a or not b:
            continue
        mongo.concept_relationships().update_one(
            {
                "user_id": user_id,
                "from_concept": a,
                "to_concept": b,
                "type": "confused_with",
            },
            {
                "$setOnInsert": {"created_at": now},
                "$set": {
                    "weight": 1.0,
                    "source_thread": thread_id,
                    "updated_at": now,
                },
            },
            upsert=True,
        )

    # Upsert exploration trail edges
    for edge in trail:
        from_c = edge.get("from", "").strip()
        to_c = edge.get("to", "").strip()
        if not from_c or not to_c:
            continue
        mongo.concept_relationships().update_one(
            {
                "user_id": user_id,
                "from_concept": from_c,
                "to_concept": to_c,
                "type": "explored_from",
            },
            {
                "$setOnInsert": {"created_at": now, "weight": 0.5},
                "$set": {
                    "source_thread": thread_id,
                    "updated_at": now,
                },
            },
            upsert=True,
        )
