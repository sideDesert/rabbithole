from typing import Literal

from pydantic import BaseModel

from app.models.base import MongoBase


class TextPosition(BaseModel):
    start: int
    end: int


class BranchPoint(MongoBase):
    thread_id: str
    message_id: str
    position: TextPosition | None = None
    type: Literal["highlight", "explore", "feynman"]
    child_thread_id: str
