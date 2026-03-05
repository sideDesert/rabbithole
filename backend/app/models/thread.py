from datetime import datetime
from typing import Any, Literal


from app.models.base import MongoBase


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
    agent: Literal["feynman", "ebbinghaus"] = "feynman"
    evermemos_group_id: str
    closed_at: datetime | None = None
    pending_test: str | None = None  # concept name if a test is pending
    phase: Literal["interview", "planning", "teaching"] = "interview"
    interview_context: dict[str, Any] = {}
    current_concept: str | None = None
