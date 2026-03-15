"""Mastery tier calculation, score updates, and review scheduling."""

from datetime import timedelta

from app.db import mongo
from app.models.base import utcnow
from app.models.mastery import ConceptMastery, ReviewSchedule

# ---------------------------------------------------------------------------
# Tier definitions
# ---------------------------------------------------------------------------

TIERS: list[tuple[float, float, str, timedelta]] = [
    (0.0, 0.4, "weak", timedelta(days=2)),
    (0.4, 0.7, "medium", timedelta(days=6)),
    (0.7, 0.9, "strong", timedelta(days=18)),
    (0.9, 1.01, "mastered", timedelta(days=30)),  # 1.01 so 1.0 is included
]


def get_tier(score: float) -> tuple[str, timedelta]:
    """Return (tier_name, review_interval) for a mastery score."""
    for low, high, name, interval in TIERS:
        if low <= score < high:
            return name, interval
    return "mastered", timedelta(days=30)


# ---------------------------------------------------------------------------
# Score computation
# ---------------------------------------------------------------------------

EMA_ALPHA = 0.4


def compute_mastery_score(current: float, new_test_score: float) -> float:
    """Exponential moving average: recent tests weigh more."""
    if current == 0.0:
        return new_test_score
    return EMA_ALPHA * new_test_score + (1 - EMA_ALPHA) * current


def compute_trend(history: list[float]) -> str:
    """Determine trend from the last 3 scores."""
    if len(history) < 2:
        return "stable"
    recent = history[-3:]
    if all(recent[i] <= recent[i + 1] for i in range(len(recent) - 1)):
        return "improving"
    if all(recent[i] >= recent[i + 1] for i in range(len(recent) - 1)):
        return "declining"
    return "stable"


# ---------------------------------------------------------------------------
# Mastery update (writes to MongoDB)
# ---------------------------------------------------------------------------


def update_concept_mastery(
    *,
    user_id: str,
    concept_name: str,
    topic_slug: str,
    overall_score: float,
    weak_areas: list[str],
) -> dict:
    """Update ConceptMastery after a test and schedule the next review.

    Returns a summary dict for the API response.
    """
    doc = mongo.concept_mastery().find_one(
        {"user_id": user_id, "concept_name": concept_name}
    )

    if doc:
        old_score = doc.get("mastery_score", 0.0)
        new_score = compute_mastery_score(old_score, overall_score)
        history: list[float] = doc.get("score_history", [])
        history.append(overall_score)
        trend = compute_trend(history)

        mongo.concept_mastery().update_one(
            {"user_id": user_id, "concept_name": concept_name},
            {
                "$set": {
                    "mastery_score": new_score,
                    "last_score": overall_score,
                    "last_reviewed": utcnow(),
                    "score_history": history,
                    "weak_subconcepts": weak_areas,
                    "strength_trend": trend,
                    "attempts": doc.get("attempts", 0) + 1,
                }
            },
        )
    else:
        old_score = 0.0
        new_score = overall_score
        mastery = ConceptMastery(
            user_id=user_id,
            concept_name=concept_name,
            mastery_score=overall_score,
            last_score=overall_score,
            last_reviewed=utcnow(),
            score_history=[overall_score],
            weak_subconcepts=weak_areas,
            strength_trend="stable",
            attempts=1,
        )
        mongo.concept_mastery().insert_one(mastery.to_doc())

    # Schedule next review
    tier_name, interval = get_tier(new_score)
    next_review = utcnow() + interval

    schedule = ReviewSchedule(
        user_id=user_id,
        concept_id=concept_name,
        topic_slug=topic_slug,
        scheduled_for=next_review,
        status="pending",
    )
    mongo.review_schedule().insert_one(schedule.to_doc())

    return {
        "previous_score": round(old_score, 3),
        "new_score": round(new_score, 3),
        "tier": tier_name,
        "next_review": next_review.isoformat(),
    }
