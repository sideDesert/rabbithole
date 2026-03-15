from typing import Literal

from app.models.base import MongoBase


class ConceptRelationship(MongoBase):
    """Edge in the knowledge graph between two concepts."""

    user_id: str
    from_concept: str  # concept_name of source node
    to_concept: str  # concept_name of target node
    type: Literal["prerequisite_of", "part_of", "explored_from", "confused_with"]
    weight: float = 1.0  # 0.0-1.0, strength of relationship
    source_thread: str = ""  # thread_id where this was detected
