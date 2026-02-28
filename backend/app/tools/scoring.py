"""Scoring sub-agent — NOT a tool. Called from the agent loop when pending_test is detected.

Scores the user's test response via an internal LLM call with structured output.
Updates mastery, creates test_result, schedules review.
"""

from datetime import timedelta

from openai import OpenAI

from app.config import SCORING_MODEL
from app.agent.prompts import SCORING_PROMPT
from app.db import mongo
from app.models.base import utcnow
from app.models.mastery import ConceptMastery, ReviewSchedule, TestResult, TestScores
from app.schemas.scoring import TestScore


def _review_interval(score: float) -> timedelta:
    """Map mastery score to review interval."""
    if score < 0.4:
        return timedelta(days=1)
    elif score < 0.7:
        return timedelta(days=5)
    elif score < 0.9:
        return timedelta(weeks=2)
    else:
        return timedelta(weeks=8)


def _strength_trend(history: list[float]) -> str:
    if len(history) < 2:
        return "stable"
    recent = history[-3:]
    if all(recent[i] >= recent[i - 1] for i in range(1, len(recent))):
        return "improving"
    if all(recent[i] <= recent[i - 1] for i in range(1, len(recent))):
        return "declining"
    return "stable"


async def score_test_response(
    *,
    user_response: str,
    concept: str,
    thread_id: str,
    user_id: str,
    llm_client: OpenAI,
) -> TestScore:
    """Score a user's test response and update mastery data.

    Returns the TestScore for sending to the client.
    """
    # Call scoring sub-agent
    response = llm_client.chat.completions.create(
        model=SCORING_MODEL,
        messages=[
            {"role": "system", "content": SCORING_PROMPT},
            {
                "role": "user",
                "content": f"Concept: {concept}\n\nUser's explanation:\n{user_response}",
            },
        ],
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or "{}"
    score = TestScore.model_validate_json(raw)

    # --- Update concept_mastery ---
    existing = mongo.concept_mastery().find_one(
        {"user_id": user_id, "concept_name": concept}
    )

    if existing:
        concept_id = existing["_id"]
        new_history = existing.get("score_history", []) + [score.overall_score]
        mongo.concept_mastery().update_one(
            {"_id": concept_id},
            {
                "$set": {
                    "mastery_score": score.overall_score,
                    "last_score": score.overall_score,
                    "last_reviewed": utcnow(),
                    "score_history": new_history,
                    "weak_subconcepts": score.weak_areas,
                    "strength_trend": _strength_trend(new_history),
                    "updated_at": utcnow(),
                },
                "$inc": {"attempts": 1},
            },
        )
    else:
        mastery = ConceptMastery(
            user_id=user_id,
            concept_name=concept,
            mastery_score=score.overall_score,
            attempts=1,
            last_reviewed=utcnow(),
            last_score=score.overall_score,
            score_history=[score.overall_score],
            weak_subconcepts=score.weak_areas,
        )
        mongo.concept_mastery().insert_one(mastery.to_doc())
        concept_id = mastery.id

    # --- Create test_result ---
    test_result = TestResult(
        user_id=user_id,
        concept_id=concept_id,
        thread_id=thread_id,
        test_type="feynman",
        question=f"Explain '{concept}' in your own words.",
        user_response=user_response,
        scores=TestScores(
            clarity=score.clarity,
            accuracy=score.accuracy,
            depth=score.depth,
            transferability=score.transferability,
        ),
        overall_score=score.overall_score,
        feedback=score.feedback,
    )
    mongo.test_results().insert_one(test_result.to_doc())

    # --- Schedule next review ---
    interval = _review_interval(score.overall_score)
    review = ReviewSchedule(
        user_id=user_id,
        concept_id=concept_id,
        scheduled_for=utcnow() + interval,
    )
    mongo.review_schedule().insert_one(review.to_doc())

    # --- Clear pending_test on thread ---
    mongo.threads().update_one(
        {"_id": thread_id},
        {"$set": {"pending_test": None, "updated_at": utcnow()}},
    )

    return score
