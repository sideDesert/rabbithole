"""Structured output schemas for the planning sub-agent."""

from pydantic import BaseModel, Field


class PlanConcept(BaseModel):
    name: str = Field(description="Short concept name, e.g. 'Ownership Rules'")
    description: str = Field(description="One-line description of what this covers")
    prerequisites: list[str] = Field(
        default=[],
        description="Names of concepts that should be learned first",
    )


class LearningPlan(BaseModel):
    """Structured output from the planning sub-agent LLM call."""

    topic: str = Field(description="The main topic being learned")
    learner_level: str = Field(
        description="Brief description of learner's level, e.g. 'Intermediate programmer, new to Rust'"
    )
    concepts: list[PlanConcept] = Field(
        description="Ordered list of concepts to learn, respecting prerequisites"
    )
    notes: str = Field(
        default="",
        description="Additional context about the learner or approach",
    )
