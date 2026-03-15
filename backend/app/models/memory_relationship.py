from typing import Literal

from app.models.base import MongoBase
from app.models.memory_entity import EntityType


RelationType = Literal[
    "part_of",
    "led_to",
    "confused_with",
    "contradicts",
    "derived_from",
    "learned_from",
]


class MemoryRelationship(MongoBase):
    """An edge in the memory graph between two entities."""

    user_id: str
    from_slug: str
    from_type: EntityType
    to_slug: str
    to_type: EntityType
    type: RelationType
    weight: float = 1.0
    source_memcell_ids: list[str] = []
