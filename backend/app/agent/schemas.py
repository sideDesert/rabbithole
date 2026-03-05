"""Tool I/O schemas for the Learning OS agent tools."""

from atomic_agents import BaseIOSchema
from pydantic import Field


# ── Memory Tool ──────────────────────────────────────────────────────────────


class MemoryRecallInput(BaseIOSchema):
    """Input for recalling memories from EverMemOS."""

    query: str = Field(description="Search query for memory retrieval")
    memory_type: str | None = Field(default=None, description="Filter by memory type (episode, event_log, foresight, profile)")


class MemoryRecallOutput(BaseIOSchema):
    """Output containing retrieved memories."""

    memories: list[dict] = Field(default_factory=list, description="List of retrieved memory objects")


class MemoryStoreInput(BaseIOSchema):
    """Input for storing a fact into EverMemOS."""

    fact: str = Field(description="The fact or information to store")


class MemoryStoreOutput(BaseIOSchema):
    """Output confirming memory storage."""

    status: str = Field(default="stored", description="Storage status")


# ── Interview Tool ───────────────────────────────────────────────────────────


class InterviewQuestion(BaseIOSchema):
    """A single interview/assessment question."""

    text: str = Field(description="The question text")
    options: list[str] | None = Field(default=None, description="Multiple choice options, if applicable")
    context: str = Field(default="", description="Additional context for the question")


class InterviewInput(BaseIOSchema):
    """Input for generating interview questions."""

    purpose: str = Field(description="Purpose of the interview (e.g. assess prior knowledge)")
    num_questions: int = Field(default=3, ge=1, le=5, description="Number of questions to generate")
    question_type: str = Field(default="multiple_choice", description="Type of questions to generate")


class InterviewOutput(BaseIOSchema):
    """Output containing generated interview questions."""

    questions: list[InterviewQuestion] = Field(description="List of generated questions")


# ── Plan Tool ────────────────────────────────────────────────────────────────


class PlanCreateInput(BaseIOSchema):
    """Input for creating a learning plan."""

    topic: str = Field(description="The topic to create a plan for")
    user_context: str = Field(description="Context about the user's background and goals")
    depth: str = Field(default="deep_dive", description="Depth of the plan (overview, deep_dive, mastery)")


class PlanCreateOutput(BaseIOSchema):
    """Output from creating a learning plan."""

    plan_content: str = Field(description="The full plan content in markdown")
    plan_path: str = Field(description="File path where the plan is stored")
    concept_count: int = Field(description="Total number of concepts in the plan")
    phase_count: int = Field(description="Total number of phases in the plan")


class PlanReadInput(BaseIOSchema):
    """Input for reading an existing learning plan."""

    topic_slug: str = Field(description="URL-friendly slug for the topic")


class PlanReadOutput(BaseIOSchema):
    """Output from reading a learning plan."""

    plan_content: str = Field(description="The full plan content in markdown")
    progress: str = Field(description="Human-readable progress summary")
    current_concept: str | None = Field(default=None, description="The concept currently being studied")
    overall_progress: float = Field(description="Overall progress as a fraction 0.0 to 1.0")


class PlanUpdateInput(BaseIOSchema):
    """Input for marking a concept as completed in a plan."""

    topic_slug: str = Field(description="URL-friendly slug for the topic")
    concept_name: str = Field(description="Name of the concept to mark as completed")


class PlanUpdateOutput(BaseIOSchema):
    """Output from updating a learning plan."""

    updated: bool = Field(description="Whether the update succeeded")
    concept: str = Field(description="The concept that was updated")
    phase_progress: float = Field(description="Progress within the current phase (0.0 to 1.0)")
    overall_progress: float = Field(description="Overall plan progress (0.0 to 1.0)")


# ── Web Search Tool ─────────────────────────────────────────────────────────


class SearchResult(BaseIOSchema):
    """A single web search result."""

    title: str = Field(description="Title of the search result")
    url: str = Field(description="URL of the search result")
    snippet: str = Field(description="Text snippet from the search result")


class WebSearchInput(BaseIOSchema):
    """Input for performing a web search."""

    query: str = Field(description="The search query")
    num_results: int = Field(default=5, ge=1, le=10, description="Number of results to return")
    search_type: str = Field(default="explanation", description="Type of search (explanation, tutorial, reference, example)")


class WebSearchOutput(BaseIOSchema):
    """Output containing web search results."""

    results: list[SearchResult] = Field(default_factory=list, description="List of search results")


# ── Branch Suggestion Tool ───────────────────────────────────────────────────


class BranchSuggestion(BaseIOSchema):
    """A suggested topic branch for deeper exploration."""

    topic: str = Field(description="The suggested sub-topic")
    reason: str = Field(description="Why this branch is relevant")
    depth_estimate: str = Field(description="Estimated depth (quick_look, moderate, deep_dive)")


class BranchSuggestionInput(BaseIOSchema):
    """Input for generating branch suggestions."""

    current_topic: str = Field(description="The topic currently being studied")
    context: str = Field(description="Conversation context for generating suggestions")


class BranchSuggestionOutput(BaseIOSchema):
    """Output containing branch suggestions."""

    suggestions: list[BranchSuggestion] = Field(description="List of suggested branches")
