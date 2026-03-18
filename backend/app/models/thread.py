from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from app.models.base import MongoBase


class TokenUsage(BaseModel):
    """Cumulative token usage for a thread across all agent runs."""

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class Thread(MongoBase):
    user_id: str
    title: str
    topic_slug: str
    summary: str | None = None
    status: Literal["active", "explored", "mastered"] = "active"
    depth: int = 0
    parent_thread_id: str | None = None
    root_thread_id: str | None = None  # set to self id if root
    branch_point_id: str | None = None
    branch_source_message_id: str | None = None
    agent: Literal["feynman", "ebbinghaus", "practice"] = "feynman"
    evermemos_group_id: str
    closed_at: datetime | None = None
    pending_test: str | None = None  # concept name if a test is pending
    phase: Literal["interview", "planning", "teaching"] = "interview"
    interview_context: dict[str, Any] = {}
    current_concept: str | None = None
    parent_summary: str | None = None   # LLM-compacted summary of parent conversation (populated async)
    branch_text: str | None = None      # highlighted text / branch topic
    token_usage: TokenUsage = TokenUsage()
    is_notification_thread: bool = False
    last_notified_at: datetime | None = None
