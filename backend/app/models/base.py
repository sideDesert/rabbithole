from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pydantic import BaseModel, Field, field_serializer


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_object_id() -> str:
    return str(ObjectId())


class MongoBase(BaseModel):
    """Base model for MongoDB documents. Uses string _id for simplicity."""

    id: str = Field(default_factory=new_object_id, alias="_id")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    model_config = {"populate_by_name": True}

    @field_serializer("created_at", "updated_at")
    def serialize_dt(self, v: datetime) -> datetime:
        return v

    def to_doc(self) -> dict[str, Any]:
        """Convert to MongoDB document dict with _id."""
        d = self.model_dump(by_alias=True)
        return d
