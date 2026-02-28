"""Mastery and testing tools — check scores, schedule reviews, administer tests."""

from app.db import mongo
from app.models.base import utcnow
from app.tools.registry import tool_registry, ToolContext


@tool_registry.register(
    agents=["feynman", "ebbinghaus"],
    description="Check the learner's mastery score for a specific concept.",
    parameters={
        "type": "object",
        "properties": {
            "concept": {
                "type": "string",
                "description": "The concept name to check mastery for",
            },
        },
        "required": ["concept"],
    },
)
async def check_mastery(concept: str, *, ctx: ToolContext) -> dict:
    doc = mongo.concept_mastery().find_one(
        {"user_id": ctx.user_id, "concept_name": concept}
    )
    if doc is None:
        return {"mastery_score": None, "message": f"No mastery data for '{concept}'"}

    return {
        "concept": concept,
        "mastery_score": doc.get("mastery_score", 0.0),
        "attempts": doc.get("attempts", 0),
        "strength_trend": doc.get("strength_trend", "stable"),
        "weak_subconcepts": doc.get("weak_subconcepts", []),
        "last_reviewed": str(doc.get("last_reviewed", "")),
    }


@tool_registry.register(
    agents=["feynman", "ebbinghaus"],
    description="Get the learner's pending review schedule — concepts due for spaced repetition.",
    parameters={
        "type": "object",
        "properties": {},
    },
)
async def get_review_schedule(*, ctx: ToolContext) -> dict:
    now = utcnow()
    docs = list(
        mongo.review_schedule()
        .find({"user_id": ctx.user_id, "status": "pending", "scheduled_for": {"$lte": now}})
        .sort("scheduled_for", 1)
        .limit(10)
    )

    reviews = []
    for doc in docs:
        # Look up concept name
        mastery = mongo.concept_mastery().find_one({"_id": doc.get("concept_id")})
        reviews.append({
            "review_id": str(doc["_id"]),
            "concept": mastery.get("concept_name", "unknown") if mastery else "unknown",
            "scheduled_for": str(doc["scheduled_for"]),
        })

    return {"due_reviews": reviews, "count": len(reviews)}


@tool_registry.register(
    agents=["feynman", "ebbinghaus"],
    description="Start a Feynman test — ask the learner to explain a concept back to you. Sets pending_test on the thread.",
    parameters={
        "type": "object",
        "properties": {
            "concept": {
                "type": "string",
                "description": "The concept to test the learner on",
            },
            "test_type": {
                "type": "string",
                "enum": ["feynman", "conceptual", "application"],
                "description": "Type of test to administer",
            },
        },
        "required": ["concept", "test_type"],
    },
)
async def administer_test(concept: str, test_type: str = "feynman", *, ctx: ToolContext) -> dict:
    # Set pending_test on the thread
    mongo.threads().update_one(
        {"_id": ctx.thread_id},
        {"$set": {"pending_test": concept, "updated_at": utcnow()}},
    )

    return {
        "status": "test_pending",
        "concept": concept,
        "test_type": test_type,
        "instruction": f"Ask the learner to explain '{concept}' in their own words. Their next message will be scored.",
    }
