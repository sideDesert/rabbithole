"""Structured output schema for the scoring sub-agent."""

from pydantic import BaseModel, Field


class TestScore(BaseModel):
    """Structured output from the scoring sub-agent LLM call."""

    clarity: float = Field(ge=0.0, le=1.0, description="How clearly the user explained the concept")
    accuracy: float = Field(ge=0.0, le=1.0, description="Factual correctness of the explanation")
    depth: float = Field(ge=0.0, le=1.0, description="How deeply the user explored the concept")
    transferability: float = Field(
        ge=0.0, le=1.0, description="Ability to apply concept to new situations"
    )
    overall_score: float = Field(ge=0.0, le=1.0, description="Weighted overall mastery score")
    feedback: str = Field(description="Detailed feedback on what the user got right and wrong")
    weak_areas: list[str] = Field(
        default=[], description="Specific sub-concepts the user should review"
    )
