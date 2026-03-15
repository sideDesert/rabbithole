"""Background foresight poller — checks EverMemOS for review signals."""

import logging

from app.config import PLANS_DIR
from app.db import mongo
from app.memory import evermemos
from app.models.mastery import ReviewSchedule
from app.plan_parser import parse_plan
from app.services.mastery import get_tier

logger = logging.getLogger(__name__)


def _load_all_completed_concepts() -> list[dict]:
    """Scan all plans and return completed concepts with their topic_slug."""
    concepts: list[dict] = []
    if not PLANS_DIR.exists():
        return concepts

    for plan_dir in PLANS_DIR.iterdir():
        plan_path = plan_dir / "plan.md"
        if not plan_path.exists():
            continue
        tree = parse_plan(plan_path.read_text())
        for phase in tree.phases:
            for concept in phase.concepts:
                if concept.completed:
                    concepts.append(
                        {"name": concept.name, "topic_slug": plan_dir.name}
                    )
    return concepts


def _match_foresight_to_concept(
    foresight_text: str, concepts: list[dict]
) -> dict | None:
    """Match a foresight string to a plan concept via substring matching.

    Tries longest concept name first for most-specific match.
    """
    text_lower = foresight_text.lower()
    # Sort by name length descending for most-specific match
    sorted_concepts = sorted(concepts, key=lambda c: len(c["name"]), reverse=True)
    for concept in sorted_concepts:
        if concept["name"].lower() in text_lower:
            return concept
    return None


async def poll_foresights(user_id: str) -> int:
    """Fetch foresights from EverMemOS and create ReviewSchedule records.

    Returns the number of new schedules created.
    """
    created = 0

    try:
        resp = await evermemos.get_memories(
            user_id=user_id, memory_type="foresight", page_size=50
        )
    except Exception as e:
        logger.warning("Failed to fetch foresights: %s", e)
        return 0

    foresights = resp.get("result", {}).get("memories", [])
    if not foresights:
        logger.info("No foresights found for user %s", user_id)
        return 0

    all_concepts = _load_all_completed_concepts()
    if not all_concepts:
        logger.info("No completed concepts found in any plan")
        return 0

    for f in foresights:
        content = f.get("content", "") or f.get("foresight", "")
        if not content:
            continue

        matched = _match_foresight_to_concept(content, all_concepts)
        if not matched:
            continue

        # Check if schedule already exists
        existing = mongo.review_schedule().find_one(
            {
                "user_id": user_id,
                "concept_id": matched["name"],
                "status": {"$in": ["pending", "triggered"]},
            }
        )
        if existing:
            continue

        # Determine interval from mastery
        mastery_doc = mongo.concept_mastery().find_one(
            {"user_id": user_id, "concept_name": matched["name"]}
        )
        score = mastery_doc["mastery_score"] if mastery_doc else 0.0
        _tier_name, interval = get_tier(score)

        from app.models.base import utcnow

        schedule = ReviewSchedule(
            user_id=user_id,
            concept_id=matched["name"],
            topic_slug=matched["topic_slug"],
            scheduled_for=utcnow() + interval,
            status="pending",
        )
        mongo.review_schedule().insert_one(schedule.to_doc())
        created += 1
        logger.info(
            "Created review schedule for '%s' (tier=%s)", matched["name"], _tier_name
        )

    return created
