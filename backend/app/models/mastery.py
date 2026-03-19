from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.base import MongoBase, utcnow


class ConceptMastery(MongoBase):
    user_id: str
    concept_name: str
    mastery_score: float = 0.0
    attempts: int = 0
    last_reviewed: datetime | None = None
    last_score: float = 0.0
    score_history: list[float] = []
    weak_subconcepts: list[str] = []
    strength_trend: Literal["improving", "stable", "declining"] = "stable"
    related_concepts: list[str] = []
    # V2 fields
    domain: str = ""  # topic_slug this concept belongs to
    source: Literal["plan", "extracted", "prerequisite"] = "plan"
    confidence: float = 1.0  # 0.0-1.0, how certain the system is
    description: str = ""  # one-line description from plan or extraction


class ReviewSchedule(MongoBase):
    user_id: str
    concept_id: str
    topic_slug: str = ""
    scheduled_for: datetime
    status: Literal["pending", "triggered", "completed", "skipped"] = "pending"
    triggered_at: datetime | None = None
    completed_at: datetime | None = None
    result_score: float | None = None


class TestScores(BaseModel):
    clarity: float = 0.0
    accuracy: float = 0.0
    depth: float = 0.0
    transferability: float = 0.0


class TestResult(MongoBase):
    user_id: str
    concept_id: str
    thread_id: str = ""
    test_type: Literal["feynman", "conceptual", "application", "practice"]
    question: str = ""
    user_response: str = ""
    scores: TestScores = Field(default_factory=TestScores)
    overall_score: float = 0.0
    feedback: str = ""
    status: Literal["in_progress", "scoring", "scored", "failed"] | None = None
    # Feynman-specific fields
    strong_topics: list[str] = Field(default_factory=list)
    weak_areas: list[str] = Field(default_factory=list)
    missed_topics: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    hint_ids: list[str] = Field(default_factory=list)
    # Practice-specific fields
    topic_slug: str = ""
    questions: list[dict] = Field(default_factory=list)
    answers: list[dict] = Field(default_factory=list)
    per_question_results: list[dict] = Field(default_factory=list)


class LearningSession(MongoBase):
    user_id: str
    root_thread_id: str
    title: str
    started_at: datetime = None  # type: ignore[assignment]
    ended_at: datetime | None = None
    concepts_covered: list[str] = []
    summary: str | None = None

    def __init__(self, **data):
        if "started_at" not in data:
            data["started_at"] = utcnow()
        super().__init__(**data)
