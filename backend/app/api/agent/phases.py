"""Phase transition logic: interview -> planning -> teaching."""

from typing import Any

from pymongo.collection import Collection

from app.models.base import utcnow


def should_transition(
    *,
    current_phase: str,
    tool_called: str | None = None,
    user_approved_plan: bool = False,
) -> str | None:
    """Return new phase name if a transition should occur, else None."""
    if current_phase == "interview" and tool_called == "create_plan":
        return "planning"
    if current_phase == "planning" and user_approved_plan:
        return "teaching"
    return None


def apply_transition(
    *,
    db_threads: Collection[dict[str, Any]],
    thread_id: str,
    new_phase: str,
    interview_context: dict[str, Any] | None = None,
) -> None:
    """Update the thread document in MongoDB with the new phase."""
    update: dict[str, Any] = {"$set": {"phase": new_phase, "updated_at": utcnow()}}
    if interview_context is not None:
        update["$set"]["interview_context"] = interview_context
    db_threads.update_one({"_id": thread_id}, update)
