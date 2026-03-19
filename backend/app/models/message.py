from typing import Any, Literal

from pydantic import Field

from app.models.base import MongoBase, new_object_id


class Message(MongoBase):
    user_id: str
    thread_id: str
    role: Literal["user", "assistant", "system"]
    content: str | dict[str, Any]  # string for text, dict for tool_call/tool_result
    type: Literal["text", "markdown", "feynman_input", "tool_call", "tool_result", "plan_card", "interview_questions", "notification"]
    status: Literal["pending", "streaming", "complete", "error"] = "complete"
    group_id: str = Field(default_factory=new_object_id)
    index: int = 0
    metadata: dict[str, Any] | None = None
