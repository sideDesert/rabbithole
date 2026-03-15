from datetime import datetime
from typing import Literal

from app.models.base import MongoBase


EntityType = Literal["concept", "person", "fact", "belief", "resource"]


class MemoryEntity(MongoBase):
    """A node in the memory graph. Single collection, type-discriminated."""

    user_id: str
    type: EntityType
    slug: str
    name: str

    # Concept-specific
    domain: str = ""
    mastery: float = 0.0
    confidence: float = 1.0

    # Person-specific
    role: str = ""

    # Fact-specific
    statement: str = ""
    about_concept_slug: str = ""
    verified: bool | None = None

    # Belief-specific
    correct: bool | None = None
    superseded_by: str = ""

    # Resource-specific
    title: str = ""
    url: str = ""
    resource_type: str = ""

    # Provenance
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    source_memcell_ids: list[str] = []
