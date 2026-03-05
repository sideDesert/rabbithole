# Study Plan Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the backend agent to use Atomic Agents framework with SSE transport, three-phase lifecycle (interview → planning → teaching), and five tools (Memory, Interview, Plan, Web Search, Branch Suggestion).

**Architecture:** Single Atomic Agents `BaseAgent` with phase-aware system prompts and tool sets. FastAPI SSE endpoint replaces WebSocket. Existing MongoDB models extended with `phase` field. Plan stored as expert-depth markdown on filesystem, parsed to tree for progress tracking.

**Tech Stack:** Atomic Agents 2.7+, Instructor, OpenAI SDK (→ OpenRouter), FastAPI StreamingResponse (SSE), Pydantic v2, MongoDB (existing)

**Design doc:** `docs/plans/2026-03-06-study-plan-agent-design.md`

---

## Task 1: Install Atomic Agents + Update Dependencies

**Files:**
- Modify: `backend/pyproject.toml`

**Step 1: Add atomic-agents and instructor to dependencies**

```toml
dependencies = [
    "atomic-agents>=2.7.0",
    "instructor>=1.6.0",
    "fastapi>=0.128.8",
    "httpx>=0.28.1",
    "openai>=2.24.0",
    "pydantic>=2.10.0",
    "pymongo[srv]>=4.16.0",
    "python-dotenv>=1.2.1",
    "uvicorn[standard]>=0.39.0",
]
```

Remove `websockets` and `requests` (no longer needed).

**Step 2: Install**

Run: `cd backend && uv sync`
Expected: dependencies resolve and install

**Step 3: Verify imports work**

Run: `cd backend && uv run python -c "import atomic_agents; import instructor; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock
git commit -m "deps: add atomic-agents and instructor, remove websockets"
```

---

## Task 2: Plan Markdown Parser

**Files:**
- Create: `backend/app/plan_parser.py`
- Create: `backend/tests/test_plan_parser.py`

**Step 1: Write the failing tests**

```python
# backend/tests/test_plan_parser.py
import pytest
from app.plan_parser import parse_plan, PlanTree, PlanPhase, PlanConcept

SAMPLE_PLAN = """\
# Async Rust: From Futures to Runtime Internals

> **Depth:** Expert | **Phases:** 3 | **Generated for:** siddarth
> **Prior knowledge:** Rust basics, some tokio usage

---

## Phase 1: The Why — Concurrency Problems That Async Solves
- [ ] The C10K problem — why threads don't scale for I/O-bound workloads
- [x] Thread-per-connection model — memory overhead, context switching costs
- [ ] Event-driven architecture — select/poll/epoll/kqueue evolution

## Phase 2: Futures — The Core Abstraction
- [ ] What a Future represents — a value that doesn't exist yet
- [ ] The Future trait — poll(cx) and Poll<T>
"""


def test_parse_plan_topic():
    tree = parse_plan(SAMPLE_PLAN)
    assert tree.topic == "Async Rust: From Futures to Runtime Internals"


def test_parse_plan_metadata():
    tree = parse_plan(SAMPLE_PLAN)
    assert tree.depth == "Expert"
    assert tree.prior_knowledge == "Rust basics, some tokio usage"


def test_parse_plan_phases():
    tree = parse_plan(SAMPLE_PLAN)
    assert len(tree.phases) == 2
    assert tree.phases[0].title == "The Why — Concurrency Problems That Async Solves"
    assert tree.phases[1].title == "Futures — The Core Abstraction"


def test_parse_plan_concepts():
    tree = parse_plan(SAMPLE_PLAN)
    phase1 = tree.phases[0]
    assert len(phase1.concepts) == 3
    assert phase1.concepts[0].name == "The C10K problem"
    assert phase1.concepts[0].description == "why threads don't scale for I/O-bound workloads"
    assert phase1.concepts[0].completed is False
    assert phase1.concepts[1].completed is True


def test_parse_plan_phase_progress():
    tree = parse_plan(SAMPLE_PLAN)
    # Phase 1: 1 of 3 completed
    assert tree.phases[0].progress == pytest.approx(1 / 3, rel=0.01)
    # Phase 2: 0 of 2 completed
    assert tree.phases[1].progress == 0.0


def test_parse_plan_overall_progress():
    tree = parse_plan(SAMPLE_PLAN)
    # 1 of 5 total concepts completed
    assert tree.overall_progress == pytest.approx(1 / 5, rel=0.01)


def test_parse_plan_first_uncompleted():
    tree = parse_plan(SAMPLE_PLAN)
    first = tree.first_uncompleted_concept()
    assert first is not None
    assert first.name == "The C10K problem"


def test_parse_plan_concept_order():
    tree = parse_plan(SAMPLE_PLAN)
    assert tree.phases[0].concepts[0].order == 0
    assert tree.phases[0].concepts[1].order == 1
    assert tree.phases[0].concepts[2].order == 2
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_plan_parser.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.plan_parser'`

**Step 3: Implement the parser**

```python
# backend/app/plan_parser.py
"""Parse expert-depth markdown learning plans into a tree structure."""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class PlanConcept:
    name: str
    description: str
    completed: bool
    order: int


@dataclass
class PlanPhase:
    title: str
    order: int
    concepts: list[PlanConcept] = field(default_factory=list)

    @property
    def progress(self) -> float:
        if not self.concepts:
            return 0.0
        return sum(1 for c in self.concepts if c.completed) / len(self.concepts)


@dataclass
class PlanTree:
    topic: str
    slug: str = ""
    depth: str = ""
    prior_knowledge: str = ""
    phases: list[PlanPhase] = field(default_factory=list)

    @property
    def overall_progress(self) -> float:
        total = sum(len(p.concepts) for p in self.phases)
        if total == 0:
            return 0.0
        completed = sum(1 for p in self.phases for c in p.concepts if c.completed)
        return completed / total

    def first_uncompleted_concept(self) -> PlanConcept | None:
        for phase in self.phases:
            for concept in phase.concepts:
                if not concept.completed:
                    return concept
        return None

    def current_phase(self) -> PlanPhase | None:
        for phase in self.phases:
            if phase.progress < 1.0:
                return phase
        return None


_CONCEPT_RE = re.compile(
    r"^- \[([ x])\] (.+?)(?:\s*—\s*(.+))?$"
)

_META_DEPTH_RE = re.compile(r"\*\*Depth:\*\*\s*(\w+)")
_META_KNOWLEDGE_RE = re.compile(r"\*\*Prior knowledge:\*\*\s*(.+)")


def parse_plan(markdown: str) -> PlanTree:
    """Parse a learning plan markdown string into a PlanTree."""
    lines = markdown.strip().splitlines()
    tree = PlanTree(topic="")
    current_phase: PlanPhase | None = None
    phase_order = 0
    concept_order = 0

    for line in lines:
        stripped = line.strip()

        # Topic title
        if stripped.startswith("# ") and not tree.topic:
            tree.topic = stripped[2:].strip()
            continue

        # Metadata blockquote
        if stripped.startswith(">"):
            content = stripped.lstrip("> ").strip()
            m = _META_DEPTH_RE.search(content)
            if m:
                tree.depth = m.group(1)
            m = _META_KNOWLEDGE_RE.search(content)
            if m:
                tree.prior_knowledge = m.group(1).strip()
            continue

        # Phase heading
        if stripped.startswith("## Phase") or stripped.startswith("## "):
            if stripped.startswith("## Phase"):
                # Strip "Phase N: " prefix
                title = re.sub(r"^## Phase \d+:\s*", "", stripped)
            else:
                title = stripped[3:].strip()
            current_phase = PlanPhase(title=title, order=phase_order)
            tree.phases.append(current_phase)
            phase_order += 1
            concept_order = 0
            continue

        # Concept checkbox
        m = _CONCEPT_RE.match(stripped)
        if m and current_phase is not None:
            completed = m.group(1) == "x"
            name = m.group(2).strip()
            description = m.group(3).strip() if m.group(3) else ""
            current_phase.concepts.append(
                PlanConcept(
                    name=name,
                    description=description,
                    completed=completed,
                    order=concept_order,
                )
            )
            concept_order += 1

    return tree
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_plan_parser.py -v`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add backend/app/plan_parser.py backend/tests/test_plan_parser.py
git commit -m "feat: add markdown plan parser with tree structure"
```

---

## Task 3: Atomic Agents Tool Schemas (I/O Schemas)

**Files:**
- Create: `backend/app/agent/schemas.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_schemas.py
from app.agent.schemas import (
    MemoryRecallInput, MemoryRecallOutput,
    MemoryStoreInput, MemoryStoreOutput,
    InterviewInput, InterviewOutput, InterviewQuestion,
    PlanCreateInput, PlanCreateOutput,
    PlanReadInput, PlanReadOutput,
    PlanUpdateInput, PlanUpdateOutput,
    WebSearchInput, WebSearchOutput, SearchResult,
    BranchSuggestionInput, BranchSuggestionOutput, BranchSuggestion,
)


def test_memory_recall_schema():
    inp = MemoryRecallInput(query="what does the user know about rust")
    assert inp.query == "what does the user know about rust"
    assert inp.memory_type is None


def test_interview_schema():
    inp = InterviewInput(
        purpose="assess rust knowledge",
        num_questions=3,
        question_type="multiple_choice",
    )
    assert inp.num_questions == 3

    q = InterviewQuestion(
        text="How familiar are you with Rust?",
        options=["Never used it", "Read the book", "Built projects", "Production experience"],
        context="Determines starting depth for ownership concepts",
    )
    assert len(q.options) == 4


def test_plan_create_schema():
    inp = PlanCreateInput(
        topic="Async Rust",
        user_context="intermediate rust, no async experience",
        depth="expert",
    )
    assert inp.depth == "expert"


def test_branch_suggestion_schema():
    s = BranchSuggestion(
        topic="Pin and Unpin",
        reason="You mentioned self-referential structs",
        depth_estimate="deep dive",
    )
    assert s.depth_estimate == "deep dive"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Implement the schemas**

```python
# backend/app/agent/schemas.py
"""Atomic Agents I/O schemas for all tools."""

from __future__ import annotations

from pydantic import Field
from atomic_agents.lib.base.base_io_schema import BaseIOSchema


# --- Memory Tool ---

class MemoryRecallInput(BaseIOSchema):
    """Search for relevant memories about the learner."""
    query: str = Field(description="Semantic search string")
    memory_type: str | None = Field(
        default=None,
        description="Filter by type: episode, event_log, foresight, profile, or None for all",
    )


class MemoryRecallOutput(BaseIOSchema):
    """Memories retrieved from EverMemOS."""
    memories: list[dict] = Field(default_factory=list)


class MemoryStoreInput(BaseIOSchema):
    """Store an observation about the learner."""
    fact: str = Field(description="The observation to remember")


class MemoryStoreOutput(BaseIOSchema):
    """Confirmation of stored memory."""
    status: str = "stored"


# --- Interview Tool ---

class InterviewQuestion(BaseIOSchema):
    """A single interview question for the learner."""
    text: str = Field(description="The question text")
    options: list[str] | None = Field(
        default=None, description="Answer options for multiple choice"
    )
    context: str = Field(
        default="", description="Why this question matters for plan generation"
    )


class InterviewInput(BaseIOSchema):
    """Generate structured interview questions for the learner."""
    purpose: str = Field(description="Why the agent needs to ask, e.g. 'assess Rust experience level'")
    num_questions: int = Field(default=3, ge=1, le=5, description="Number of questions to generate")
    question_type: str = Field(
        default="multiple_choice",
        description="Type: multiple_choice, open_ended, or scale",
    )


class InterviewOutput(BaseIOSchema):
    """Generated interview questions."""
    questions: list[InterviewQuestion]


# --- Plan Tool ---

class PlanCreateInput(BaseIOSchema):
    """Create an expert-depth learning plan."""
    topic: str = Field(description="The topic to create a plan for")
    user_context: str = Field(description="Serialized interview answers + memory context")
    depth: str = Field(
        default="deep_dive",
        description="Plan depth: overview, intermediate, deep_dive, or expert",
    )


class PlanCreateOutput(BaseIOSchema):
    """Result of plan creation."""
    plan_content: str = Field(description="Full markdown plan")
    plan_path: str = Field(description="Filesystem path to plan.md")
    concept_count: int = Field(description="Number of concepts in the plan")
    phase_count: int = Field(description="Number of phases in the plan")


class PlanReadInput(BaseIOSchema):
    """Read the current learning plan."""
    topic_slug: str = Field(description="Topic slug, e.g. 'async-rust'")


class PlanReadOutput(BaseIOSchema):
    """Current plan content and progress."""
    plan_content: str
    progress: str = Field(description="e.g. '5/20 concepts completed'")
    current_concept: str | None = Field(
        default=None, description="Next uncompleted concept name"
    )
    overall_progress: float = Field(default=0.0, description="0.0 to 1.0")


class PlanUpdateInput(BaseIOSchema):
    """Mark a concept as completed in the plan."""
    topic_slug: str = Field(description="Topic slug")
    concept_name: str = Field(description="Exact concept name to mark complete")


class PlanUpdateOutput(BaseIOSchema):
    """Result of updating plan progress."""
    updated: bool
    concept: str
    phase_progress: float = Field(description="Progress of the phase this concept belongs to")
    overall_progress: float = Field(description="Overall plan progress")


# --- Web Search Tool ---

class SearchResult(BaseIOSchema):
    """A single web search result."""
    title: str
    url: str
    snippet: str


class WebSearchInput(BaseIOSchema):
    """Search the web for curriculum or explanatory content."""
    query: str = Field(description="Search query")
    num_results: int = Field(default=5, ge=1, le=10)
    search_type: str = Field(
        default="explanation",
        description="Type: curriculum, explanation, or resource",
    )


class WebSearchOutput(BaseIOSchema):
    """Web search results."""
    results: list[SearchResult] = Field(default_factory=list)


# --- Branch Suggestion Tool ---

class BranchSuggestion(BaseIOSchema):
    """A suggested sub-topic to branch into."""
    topic: str = Field(description="Suggested sub-topic")
    reason: str = Field(description="Why this is relevant right now")
    depth_estimate: str = Field(description="quick detour or deep dive")


class BranchSuggestionInput(BaseIOSchema):
    """Suggest related sub-topics the learner might want to explore."""
    current_topic: str = Field(description="What's currently being discussed")
    context: str = Field(description="What the user asked or expressed interest in")


class BranchSuggestionOutput(BaseIOSchema):
    """Branch suggestions for the learner."""
    suggestions: list[BranchSuggestion]
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_schemas.py -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add backend/app/agent/schemas.py backend/tests/test_schemas.py
git commit -m "feat: add Atomic Agents I/O schemas for all tools"
```

---

## Task 4: Tool Implementations (Atomic Agents Style)

**Files:**
- Create: `backend/app/agent/tools.py`
- Create: `backend/tests/test_tools.py`

This replaces the existing `app/tools/` registry-based tools with Atomic Agents tool classes. The old `app/tools/` directory will be removed in a later cleanup task.

**Step 1: Write failing tests**

```python
# backend/tests/test_tools.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
import tempfile

from app.agent.tools import (
    MemoryRecallTool, MemoryStoreTool,
    PlanReadTool, PlanUpdateTool,
    WebSearchTool,
    BranchSuggestionTool,
)
from app.agent.schemas import (
    MemoryRecallInput, MemoryStoreInput,
    PlanReadInput, PlanUpdateInput,
    WebSearchInput,
    BranchSuggestionInput,
)


def test_memory_recall_returns_empty():
    """Dummy memory tool returns empty list."""
    tool = MemoryRecallTool()
    result = tool.run(MemoryRecallInput(query="rust ownership"))
    assert result.memories == []


def test_memory_store_returns_stored():
    tool = MemoryStoreTool()
    result = tool.run(MemoryStoreInput(fact="user knows Python well"))
    assert result.status == "stored"


def test_plan_read_tool(tmp_path):
    """Reads plan from filesystem and parses progress."""
    plan_dir = tmp_path / "async-rust"
    plan_dir.mkdir()
    (plan_dir / "plan.md").write_text(
        "# Async Rust\n\n"
        "> **Depth:** Expert | **Phases:** 1 | **Generated for:** test\n"
        "> **Prior knowledge:** none\n\n---\n\n"
        "## Phase 1: Basics\n"
        "- [x] Concept A — description a\n"
        "- [ ] Concept B — description b\n"
    )
    tool = PlanReadTool(plans_dir=tmp_path)
    result = tool.run(PlanReadInput(topic_slug="async-rust"))
    assert "Concept A" in result.plan_content
    assert result.current_concept == "Concept B"
    assert result.overall_progress == pytest.approx(0.5)


def test_plan_update_tool(tmp_path):
    """Toggles checkbox in markdown."""
    plan_dir = tmp_path / "async-rust"
    plan_dir.mkdir()
    plan_md = (
        "# Async Rust\n\n"
        "> **Depth:** Expert | **Phases:** 1 | **Generated for:** test\n"
        "> **Prior knowledge:** none\n\n---\n\n"
        "## Phase 1: Basics\n"
        "- [ ] Concept A — description a\n"
        "- [ ] Concept B — description b\n"
    )
    (plan_dir / "plan.md").write_text(plan_md)
    tool = PlanUpdateTool(plans_dir=tmp_path)
    result = tool.run(PlanUpdateInput(topic_slug="async-rust", concept_name="Concept A"))
    assert result.updated is True
    assert result.overall_progress == pytest.approx(0.5)
    # Verify file was modified
    content = (plan_dir / "plan.md").read_text()
    assert "- [x] Concept A" in content


def test_web_search_returns_placeholder():
    tool = WebSearchTool()
    result = tool.run(WebSearchInput(query="async rust tutorial"))
    assert isinstance(result.results, list)


def test_branch_suggestion_returns_placeholder():
    tool = BranchSuggestionTool()
    result = tool.run(BranchSuggestionInput(
        current_topic="Futures",
        context="user asked about Pin"
    ))
    assert isinstance(result.suggestions, list)
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_tools.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Implement the tools**

```python
# backend/app/agent/tools.py
"""Atomic Agents tool implementations for the study plan agent."""

from __future__ import annotations

import re
from pathlib import Path

from atomic_agents.lib.tools.base import BaseTool, BaseToolConfig

from app.agent.schemas import (
    MemoryRecallInput, MemoryRecallOutput,
    MemoryStoreInput, MemoryStoreOutput,
    InterviewInput, InterviewOutput, InterviewQuestion,
    PlanCreateInput, PlanCreateOutput,
    PlanReadInput, PlanReadOutput,
    PlanUpdateInput, PlanUpdateOutput,
    WebSearchInput, WebSearchOutput, SearchResult,
    BranchSuggestionInput, BranchSuggestionOutput, BranchSuggestion,
)
from app.plan_parser import parse_plan


# --- Memory Tools (dummy) ---

class MemoryRecallTool(BaseTool):
    input_schema = MemoryRecallInput
    output_schema = MemoryRecallOutput

    def run(self, params: MemoryRecallInput) -> MemoryRecallOutput:
        # TODO: integrate with EverMemOS
        # GET /api/v1/memories/search?user_id=X&query=params.query&retrieve_method=rrf&top_k=10
        return MemoryRecallOutput(memories=[])


class MemoryStoreTool(BaseTool):
    input_schema = MemoryStoreInput
    output_schema = MemoryStoreOutput

    def run(self, params: MemoryStoreInput) -> MemoryStoreOutput:
        # TODO: integrate with EverMemOS
        # POST /api/v1/memories
        return MemoryStoreOutput(status="stored")


# --- Interview Tool ---
# Note: This tool generates questions via a sub-LLM call.
# For now, it returns placeholder questions.
# The actual LLM sub-call will be wired in Task 6 (agent setup).

class InterviewTool(BaseTool):
    input_schema = InterviewInput
    output_schema = InterviewOutput

    def run(self, params: InterviewInput) -> InterviewOutput:
        # Placeholder — the agent itself will generate the questions
        # in its response. This tool is for structured question generation
        # via a sub-LLM call, which we'll implement when wiring the agent.
        return InterviewOutput(questions=[
            InterviewQuestion(
                text=f"Question about: {params.purpose}",
                options=["Option A", "Option B", "Option C", "Option D"] if params.question_type == "multiple_choice" else None,
                context=params.purpose,
            )
        ])


# --- Plan Tools ---

class PlanReadToolConfig(BaseToolConfig):
    plans_dir: Path = Path("plans")


class PlanReadTool(BaseTool):
    input_schema = PlanReadInput
    output_schema = PlanReadOutput

    def __init__(self, plans_dir: Path | None = None, **kwargs):
        super().__init__(**kwargs)
        self._plans_dir = plans_dir or Path("plans")

    def run(self, params: PlanReadInput) -> PlanReadOutput:
        plan_path = self._plans_dir / params.topic_slug / "plan.md"
        if not plan_path.exists():
            return PlanReadOutput(
                plan_content="",
                progress="No plan found",
                current_concept=None,
                overall_progress=0.0,
            )

        content = plan_path.read_text()
        tree = parse_plan(content)
        first = tree.first_uncompleted_concept()
        total = sum(len(p.concepts) for p in tree.phases)
        completed = sum(1 for p in tree.phases for c in p.concepts if c.completed)

        return PlanReadOutput(
            plan_content=content,
            progress=f"{completed}/{total} concepts completed",
            current_concept=first.name if first else None,
            overall_progress=tree.overall_progress,
        )


class PlanUpdateTool(BaseTool):
    input_schema = PlanUpdateInput
    output_schema = PlanUpdateOutput

    def __init__(self, plans_dir: Path | None = None, **kwargs):
        super().__init__(**kwargs)
        self._plans_dir = plans_dir or Path("plans")

    def run(self, params: PlanUpdateInput) -> PlanUpdateOutput:
        plan_path = self._plans_dir / params.topic_slug / "plan.md"
        if not plan_path.exists():
            return PlanUpdateOutput(
                updated=False, concept=params.concept_name,
                phase_progress=0.0, overall_progress=0.0,
            )

        content = plan_path.read_text()

        # Toggle checkbox for this concept
        pattern = rf"- \[ \] {re.escape(params.concept_name)}( —|\n|$)"
        if not re.search(pattern, content):
            return PlanUpdateOutput(
                updated=False, concept=params.concept_name,
                phase_progress=0.0, overall_progress=0.0,
            )

        new_content = re.sub(
            rf"- \[ \] ({re.escape(params.concept_name)})",
            r"- [x] \1",
            content,
            count=1,
        )
        plan_path.write_text(new_content)

        # Parse updated plan for progress
        tree = parse_plan(new_content)
        phase_progress = 0.0
        for phase in tree.phases:
            for concept in phase.concepts:
                if concept.name == params.concept_name:
                    phase_progress = phase.progress
                    break

        return PlanUpdateOutput(
            updated=True,
            concept=params.concept_name,
            phase_progress=phase_progress,
            overall_progress=tree.overall_progress,
        )


# --- Web Search Tool (placeholder) ---

class WebSearchTool(BaseTool):
    input_schema = WebSearchInput
    output_schema = WebSearchOutput

    def run(self, params: WebSearchInput) -> WebSearchOutput:
        # TODO: integrate with SearXNG, Tavily, or Serper
        return WebSearchOutput(results=[])


# --- Branch Suggestion Tool (placeholder) ---

class BranchSuggestionTool(BaseTool):
    input_schema = BranchSuggestionInput
    output_schema = BranchSuggestionOutput

    def run(self, params: BranchSuggestionInput) -> BranchSuggestionOutput:
        # Placeholder — in production, this would query the plan tree
        # and memory to suggest relevant branches
        return BranchSuggestionOutput(suggestions=[])
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_tools.py -v`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add backend/app/agent/tools.py backend/tests/test_tools.py
git commit -m "feat: add Atomic Agents tool implementations"
```

---

## Task 5: Update Thread Model with Phase Field

**Files:**
- Modify: `backend/app/models/thread.py`
- Create: `backend/tests/test_thread_model.py`

**Step 1: Write failing test**

```python
# backend/tests/test_thread_model.py
from app.models.thread import Thread


def test_thread_has_phase_field():
    t = Thread(
        user_id="u1",
        title="Learn Rust",
        topic_slug="rust",
        evermemos_group_id="g1",
        phase="interview",
    )
    assert t.phase == "interview"


def test_thread_phase_defaults_to_interview():
    t = Thread(
        user_id="u1",
        title="Learn Rust",
        topic_slug="rust",
        evermemos_group_id="g1",
    )
    assert t.phase == "interview"


def test_thread_has_interview_context():
    t = Thread(
        user_id="u1",
        title="Learn Rust",
        topic_slug="rust",
        evermemos_group_id="g1",
        interview_context={"experience": "beginner"},
    )
    assert t.interview_context["experience"] == "beginner"


def test_thread_has_current_concept():
    t = Thread(
        user_id="u1",
        title="Learn Rust",
        topic_slug="rust",
        evermemos_group_id="g1",
        current_concept="The C10K problem",
    )
    assert t.current_concept == "The C10K problem"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_thread_model.py -v`
Expected: FAIL — `TypeError: unexpected keyword argument 'phase'`

**Step 3: Add phase, interview_context, current_concept to Thread**

Modify `backend/app/models/thread.py` — add these fields:

```python
from datetime import datetime
from typing import Any, Literal

from app.models.base import MongoBase


class Thread(MongoBase):
    user_id: str
    title: str
    topic_slug: str
    summary: str | None = None
    status: Literal["active", "explored", "mastered"] = "active"
    phase: Literal["interview", "planning", "teaching"] = "interview"
    depth: int = 0
    parent_thread_id: str | None = None
    root_thread_id: str | None = None
    branch_point_id: str | None = None
    agent: Literal["feynman", "ebbinghaus"] = "feynman"
    evermemos_group_id: str
    interview_context: dict[str, Any] = {}
    current_concept: str | None = None
    closed_at: datetime | None = None
    pending_test: str | None = None
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_thread_model.py -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add backend/app/models/thread.py backend/tests/test_thread_model.py
git commit -m "feat: add phase, interview_context, current_concept to Thread model"
```

---

## Task 6: Phase-Aware System Prompts

**Files:**
- Modify: `backend/app/agent/prompts.py`
- Create: `backend/tests/test_prompts.py`

**Step 1: Write failing test**

```python
# backend/tests/test_prompts.py
from app.agent.prompts import build_phase_prompt


def test_interview_prompt_contains_assessment():
    prompt = build_phase_prompt(phase="interview")
    assert "assess" in prompt.lower() or "interview" in prompt.lower()
    assert "Memory" in prompt or "memory" in prompt


def test_planning_prompt_contains_curriculum():
    prompt = build_phase_prompt(phase="planning")
    assert "curriculum" in prompt.lower() or "plan" in prompt.lower()
    assert "expert" in prompt.lower() or "deep" in prompt.lower()


def test_teaching_prompt_contains_feynman():
    prompt = build_phase_prompt(phase="teaching")
    assert "Feynman" in prompt or "intuition" in prompt.lower()


def test_teaching_prompt_with_plan_context():
    prompt = build_phase_prompt(
        phase="teaching",
        plan_context="## Phase 1\n- [ ] Ownership",
        current_concept="Ownership",
    )
    assert "Ownership" in prompt


def test_teaching_prompt_with_memory_context():
    prompt = build_phase_prompt(
        phase="teaching",
        memory_context="User prefers visual examples",
    )
    assert "visual examples" in prompt
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_prompts.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_phase_prompt'`

**Step 3: Rewrite prompts.py with phase-aware builder**

Keep the existing `build_system_prompt` for backward compat, add `build_phase_prompt`:

```python
# Add to backend/app/agent/prompts.py (keep existing code, add below)

INTERVIEW_PROMPT = """\
You are Mr. Feynman — a brilliant, curious teaching companion inside Rabbithole.

You are conducting an initial assessment of the learner before creating their study plan.

Your process:
1. Use the Memory tool first to check what you already know about this learner from past sessions.
2. Only ask questions about things Memory doesn't already know.
3. Use the Interview tool to generate focused assessment questions.
4. Assess: experience level, goals, desired depth, time commitment, learning style.
5. When you have enough context (typically 3-7 questions), call create_plan to generate the curriculum.

Style:
- Be conversational, warm, and curious — not like a quiz.
- Render interview questions as formatted markdown with clear options.
- Acknowledge what you already know from memory: "I remember you've worked with X before..."
- Adapt your questions based on previous answers.
"""

PLAN_GENERATION_PROMPT = """\
You are Mr. Feynman designing an expert-depth learning curriculum.

The plan must be comprehensive and deep — not a tutorial outline. A senior engineer's learning roadmap.
Cover: history, motivation, problem statements, architectural internals, the "why" before the "how."

Your process:
1. Review the interview answers and memory context provided.
2. Use Web Search to research curriculum structure and authoritative resources.
3. Generate the plan using the create_plan tool.
4. Present the plan to the user and ask for approval or changes.

Plan format rules:
- Each concept: `- [ ] Concept Name — description of what this covers`
- Group into logical phases with `## Phase N: Title` headings
- Include metadata blockquote at top: depth, prior knowledge
- Adapt depth and coverage based on interview answers (beginner gets more fundamentals, expert skips basics)
- 15-40 concepts for a deep topic, 5-15 for an overview
"""

TEACHING_PROMPT = """\
You are Mr. Feynman — a brilliant, curious teaching companion inside Rabbithole.

You are teaching through an approved study plan, one concept at a time.

Your style:
- Teach through intuition, analogy, and simplification. If a 5-year-old couldn't follow your analogy, simplify further.
- Be conversational, not lecturing. Ask questions. Check understanding as you go.
- Deliver content incrementally — never dump walls of text.
- Use code examples where relevant.
- Build each concept on what came before.

Your process:
1. Check the plan (get_plan) to find the current uncompleted concept.
2. Teach using Feynman method — simplify, use analogies, build up gradually.
3. Check understanding — ask the learner to rephrase or apply the concept.
4. When a concept is covered, call update_plan_progress to mark it complete.
5. Use branch_suggestion when the learner shows curiosity about related topics.
6. Store important observations about the learner to memory.

Important:
- One concept at a time — don't rush ahead.
- If the learner seems confused about a sub-concept, suggest a branch.
- If you need to clarify the learner's goals mid-lesson, use the Interview tool.
"""


def build_phase_prompt(
    *,
    phase: str,
    plan_context: str | None = None,
    current_concept: str | None = None,
    memory_context: str | None = None,
    interview_context: str | None = None,
) -> str:
    """Build the system prompt for the current phase."""
    base = {
        "interview": INTERVIEW_PROMPT,
        "planning": PLAN_GENERATION_PROMPT,
        "teaching": TEACHING_PROMPT,
    }[phase]

    sections = [base]

    if plan_context:
        sections.append(f"\n## Current Learning Plan\n```markdown\n{plan_context}\n```\n")

    if current_concept:
        sections.append(f"\n## Current Concept\nYou are teaching: **{current_concept}**\n")

    if memory_context:
        sections.append(f"\n## What You Remember About This Learner\n{memory_context}\n")

    if interview_context:
        sections.append(f"\n## Interview Context\n{interview_context}\n")

    return "\n".join(sections)
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_prompts.py -v`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add backend/app/agent/prompts.py backend/tests/test_prompts.py
git commit -m "feat: add phase-aware system prompts for interview/planning/teaching"
```

---

## Task 7: Agent Setup + SSE Endpoint

**Files:**
- Create: `backend/app/agent/agent.py`
- Modify: `backend/main.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/chat.py`

This is the core task — wiring the Atomic Agents agent with phase-aware prompts, tools, and SSE streaming.

**Step 1: Create the agent factory**

```python
# backend/app/agent/agent.py
"""Atomic Agents agent factory — creates phase-aware agents."""

from __future__ import annotations

from pathlib import Path

import instructor
from openai import OpenAI

from atomic_agents.agents.base_agent import BaseAgent, BaseAgentConfig, BaseAgentInputSchema, BaseAgentOutputSchema
from atomic_agents.lib.components.system_prompt_generator import SystemPromptGenerator
from atomic_agents.lib.components.agent_memory import AgentMemory

from app.config import OPENROUTER_BASE_URL, OPENROUTER_API, DEFAULT_MODEL, PLANS_DIR
from app.agent.prompts import build_phase_prompt
from app.agent.tools import (
    MemoryRecallTool, MemoryStoreTool,
    InterviewTool,
    PlanReadTool, PlanUpdateTool,
    WebSearchTool,
    BranchSuggestionTool,
)


PHASE_TOOLS = {
    "interview": [MemoryRecallTool, MemoryStoreTool, InterviewTool],
    "planning": [MemoryRecallTool, MemoryStoreTool, WebSearchTool],
    "teaching": [
        MemoryRecallTool, MemoryStoreTool,
        WebSearchTool, BranchSuggestionTool,
        PlanReadTool, PlanUpdateTool,
        InterviewTool,
    ],
}


def get_instructor_client() -> instructor.Instructor:
    """Create an Instructor-wrapped OpenAI client pointing at OpenRouter."""
    return instructor.from_openai(
        OpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=OPENROUTER_API,
        )
    )


def create_agent(
    *,
    phase: str,
    memory: AgentMemory | None = None,
    plan_context: str | None = None,
    current_concept: str | None = None,
    memory_context: str | None = None,
    interview_context: str | None = None,
    plans_dir: Path | None = None,
) -> BaseAgent:
    """Create a phase-configured Atomic Agents agent."""
    client = get_instructor_client()
    _plans_dir = plans_dir or PLANS_DIR

    system_prompt = build_phase_prompt(
        phase=phase,
        plan_context=plan_context,
        current_concept=current_concept,
        memory_context=memory_context,
        interview_context=interview_context,
    )

    # Instantiate tools for this phase
    tool_instances = []
    for tool_cls in PHASE_TOOLS[phase]:
        if tool_cls in (PlanReadTool, PlanUpdateTool):
            tool_instances.append(tool_cls(plans_dir=_plans_dir))
        else:
            tool_instances.append(tool_cls())

    # Build system prompt generator
    prompt_gen = SystemPromptGenerator(
        background=[system_prompt],
        steps=[],
        output_instructions=[],
    )

    config = BaseAgentConfig(
        client=client,
        model=DEFAULT_MODEL,
        system_prompt_generator=prompt_gen,
        memory=memory or AgentMemory(),
    )

    agent = BaseAgent(config=config)

    # Register tools with the agent
    for tool in tool_instances:
        agent.register_tool(tool)

    return agent
```

**Step 2: Create the SSE chat endpoint**

```python
# backend/app/api/__init__.py
```

```python
# backend/app/api/chat.py
"""SSE streaming chat endpoint."""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from atomic_agents.agents.base_agent import BaseAgentInputSchema
from atomic_agents.lib.components.agent_memory import AgentMemory

from app.db import mongo
from app.models.thread import Thread
from app.models.message import Message
from app.models.base import new_object_id, utcnow
from app.agent.agent import create_agent
from app.plan_parser import parse_plan
from app.config import PLANS_DIR

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    content: str


def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _load_plan_context(topic_slug: str | None) -> tuple[str | None, str | None]:
    """Load plan content and current concept from filesystem."""
    if not topic_slug:
        return None, None
    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return None, None
    content = plan_path.read_text()
    tree = parse_plan(content)
    first = tree.first_uncompleted_concept()
    return content, first.name if first else None


@router.post("/threads")
async def create_thread(request: Request):
    """Create a new thread — starts in interview phase."""
    user_id = "user_001"  # TODO: auth
    body = await request.json()
    title = body.get("title", "New Conversation")
    topic_slug = body.get("topic_slug", "")

    thread = Thread(
        user_id=user_id,
        title=title,
        topic_slug=topic_slug,
        evermemos_group_id=str(uuid.uuid4()),
        phase="interview",
    )
    thread.root_thread_id = thread.id
    mongo.threads().insert_one(thread.to_doc())

    return {"thread_id": thread.id, "phase": thread.phase}


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    """Get thread details."""
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "Thread not found"}
    return doc


@router.get("/threads/{thread_id}/progress")
async def get_progress(thread_id: str):
    """Get plan progress as parsed tree."""
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "Thread not found"}

    topic_slug = doc.get("topic_slug")
    if not topic_slug:
        return {"error": "No plan associated with this thread"}

    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"error": "Plan file not found"}

    tree = parse_plan(plan_path.read_text())
    return {
        "topic": tree.topic,
        "phase": doc.get("phase", "interview"),
        "overall_progress": tree.overall_progress,
        "phases": [
            {
                "title": p.title,
                "progress": p.progress,
                "concepts": len(p.concepts),
                "completed": sum(1 for c in p.concepts if c.completed),
                "items": [
                    {"name": c.name, "description": c.description, "completed": c.completed}
                    for c in p.concepts
                ],
            }
            for p in tree.phases
        ],
        "current_concept": tree.first_uncompleted_concept().name if tree.first_uncompleted_concept() else None,
    }


@router.get("/threads")
async def list_threads():
    """List all threads for the current user."""
    user_id = "user_001"  # TODO: auth
    docs = list(
        mongo.threads()
        .find({"user_id": user_id})
        .sort("updated_at", -1)
        .limit(50)
    )
    return {"threads": docs}


@router.post("/chat/{thread_id}")
async def chat(thread_id: str, body: ChatRequest):
    """SSE streaming chat endpoint."""

    async def event_stream():
        # 1. Load thread
        thread_doc = mongo.threads().find_one({"_id": thread_id})
        if not thread_doc:
            yield _sse_event({"type": "error", "content": "Thread not found"})
            return

        phase = thread_doc.get("phase", "interview")
        topic_slug = thread_doc.get("topic_slug")
        interview_ctx = thread_doc.get("interview_context", {})

        # 2. Load plan context if in teaching phase
        plan_context, current_concept = _load_plan_context(topic_slug)

        # 3. Persist user message
        group_id = new_object_id()
        user_msg = Message(
            user_id=thread_doc["user_id"],
            thread_id=thread_id,
            role="user",
            content=body.content,
            type="text",
            group_id=group_id,
            index=0,
        )
        mongo.messages().insert_one(user_msg.to_doc())

        # 4. Load conversation history into AgentMemory
        memory = AgentMemory()
        history_docs = list(
            mongo.messages()
            .find({"thread_id": thread_id, "type": {"$in": ["text", "markdown"]}})
            .sort("created_at", 1)
            .limit(50)
        )
        for doc in history_docs[:-1]:  # exclude the message we just inserted
            role = doc["role"]
            content = doc["content"] if isinstance(doc["content"], str) else json.dumps(doc["content"])
            if role == "user":
                memory.add_message("user", content)
            elif role == "assistant":
                memory.add_message("assistant", content)

        # 5. Create phase-aware agent
        agent = create_agent(
            phase=phase,
            memory=memory,
            plan_context=plan_context,
            current_concept=current_concept,
            memory_context=json.dumps(interview_ctx) if interview_ctx else None,
            interview_context=json.dumps(interview_ctx) if interview_ctx else None,
        )

        # 6. Run agent
        yield _sse_event({"type": "phase", "phase": phase})

        input_schema = BaseAgentInputSchema(chat_message=body.content)
        response = agent.run(input_schema)

        # 7. Stream the response
        # Note: Atomic Agents run() returns complete response.
        # For true streaming, use agent.stream_response_async() in future.
        response_text = response.chat_message if hasattr(response, 'chat_message') else str(response)

        yield _sse_event({"type": "stream", "content": response_text})

        # 8. Persist assistant message
        assistant_msg = Message(
            user_id=thread_doc["user_id"],
            thread_id=thread_id,
            role="assistant",
            content=response_text,
            type="markdown",
            group_id=group_id,
            index=1,
        )
        mongo.messages().insert_one(assistant_msg.to_doc())

        # 9. Update thread timestamp
        mongo.threads().update_one(
            {"_id": thread_id},
            {"$set": {"updated_at": utcnow()}},
        )

        yield _sse_event({"type": "end"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

**Step 3: Update main.py to include the new router**

Modify `backend/main.py` — add the router import and include it. Keep the existing WebSocket endpoint for now (backward compat), add the new SSE routes:

Add after the `app = FastAPI(...)` line:

```python
from app.api.chat import router as chat_router
app.include_router(chat_router)
```

**Step 4: Test manually**

Run: `cd backend && uv run uvicorn main:app --reload --port 8000`

Test thread creation:
```bash
curl -X POST http://localhost:8000/api/threads \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn Async Rust", "topic_slug": "async-rust"}'
```
Expected: `{"thread_id": "...", "phase": "interview"}`

Test SSE chat (replace THREAD_ID):
```bash
curl -N -X POST http://localhost:8000/api/chat/THREAD_ID \
  -H "Content-Type: application/json" \
  -d '{"content": "I want to learn async Rust"}'
```
Expected: SSE events with `type: phase`, `type: stream`, `type: end`

**Step 5: Commit**

```bash
git add backend/app/agent/agent.py backend/app/api/__init__.py backend/app/api/chat.py backend/main.py
git commit -m "feat: add SSE chat endpoint with phase-aware Atomic Agents agent"
```

---

## Task 8: Plan Creation Tool (LLM Sub-Call)

**Files:**
- Modify: `backend/app/agent/tools.py` (add PlanCreateTool)
- Create: `backend/tests/test_plan_create.py`

This is the tool that generates the expert-depth markdown plan via an LLM sub-call.

**Step 1: Write failing test**

```python
# backend/tests/test_plan_create.py
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path

from app.agent.tools import PlanCreateTool
from app.agent.schemas import PlanCreateInput


def test_plan_create_writes_markdown(tmp_path):
    """PlanCreateTool should write a markdown plan file."""
    # Mock the LLM client to return a structured plan
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = """\
# Async Rust: Deep Dive

> **Depth:** Expert | **Phases:** 2 | **Generated for:** test
> **Prior knowledge:** Rust basics

---

## Phase 1: Foundations
- [ ] The C10K problem — why threads don't scale
- [ ] Event-driven architecture — epoll and kqueue

## Phase 2: Futures
- [ ] What a Future represents — a value that doesn't exist yet
- [ ] The Future trait — poll and Poll<T>
"""

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    tool = PlanCreateTool(plans_dir=tmp_path, llm_client=mock_client)
    result = tool.run(PlanCreateInput(
        topic="Async Rust",
        user_context="intermediate rust dev, no async experience",
        depth="expert",
    ))

    assert result.concept_count == 4
    assert result.phase_count == 2
    assert (tmp_path / "async-rust" / "plan.md").exists()
    content = (tmp_path / "async-rust" / "plan.md").read_text()
    assert "C10K" in content
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_plan_create.py -v`
Expected: FAIL — `ImportError: cannot import name 'PlanCreateTool'`

**Step 3: Implement PlanCreateTool**

Add to `backend/app/agent/tools.py`:

```python
import re as _re


def _slugify(text: str) -> str:
    """Convert topic name to URL-safe slug."""
    slug = text.lower().strip()
    slug = _re.sub(r"[^\w\s-]", "", slug)
    slug = _re.sub(r"[\s_]+", "-", slug)
    slug = _re.sub(r"-+", "-", slug)
    return slug.strip("-")


PLAN_GENERATION_SYSTEM = """\
You are an expert curriculum designer. Generate a comprehensive, expert-depth learning plan as markdown.

Rules:
- Cover history, motivation, problem statements, architectural internals — the "why" before the "how."
- This is a senior engineer's learning roadmap, not a tutorial sidebar.
- Format each concept as: `- [ ] Concept Name — description of what to cover`
- Group into logical phases with `## Phase N: Title` headings
- Start with a metadata blockquote: depth, phase count, prior knowledge
- Separate the metadata from the phases with `---`
- Adapt depth based on the learner context provided
- For "expert" depth: 20-40 concepts across 4-8 phases
- For "deep_dive" depth: 15-30 concepts across 3-6 phases
- For "intermediate" depth: 10-20 concepts across 2-4 phases
- For "overview" depth: 5-12 concepts across 1-3 phases
"""


class PlanCreateTool(BaseTool):
    input_schema = PlanCreateInput
    output_schema = PlanCreateOutput

    def __init__(self, plans_dir: Path | None = None, llm_client=None, **kwargs):
        super().__init__(**kwargs)
        self._plans_dir = plans_dir or Path("plans")
        self._llm_client = llm_client

    def _get_client(self):
        if self._llm_client:
            return self._llm_client
        from app.config import OPENROUTER_BASE_URL, OPENROUTER_API, PLANNING_MODEL
        from openai import OpenAI
        return OpenAI(base_url=OPENROUTER_BASE_URL, api_key=OPENROUTER_API)

    def run(self, params: PlanCreateInput) -> PlanCreateOutput:
        from app.config import PLANNING_MODEL

        client = self._get_client()
        response = client.chat.completions.create(
            model=PLANNING_MODEL,
            messages=[
                {"role": "system", "content": PLAN_GENERATION_SYSTEM},
                {
                    "role": "user",
                    "content": (
                        f"Create a {params.depth} learning plan for: {params.topic}\n\n"
                        f"Learner context: {params.user_context}"
                    ),
                },
            ],
        )

        plan_markdown = response.choices[0].message.content or ""

        # Save to filesystem
        slug = _slugify(params.topic)
        plan_dir = self._plans_dir / slug
        plan_dir.mkdir(parents=True, exist_ok=True)
        (plan_dir / "notes").mkdir(exist_ok=True)
        (plan_dir / "plan.md").write_text(plan_markdown)

        # Parse for stats
        tree = parse_plan(plan_markdown)

        return PlanCreateOutput(
            plan_content=plan_markdown,
            plan_path=str(plan_dir / "plan.md"),
            concept_count=sum(len(p.concepts) for p in tree.phases),
            phase_count=len(tree.phases),
        )
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_plan_create.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/agent/tools.py backend/tests/test_plan_create.py
git commit -m "feat: add PlanCreateTool with LLM sub-call for expert-depth plans"
```

---

## Task 9: Phase Transition Logic

**Files:**
- Create: `backend/app/agent/phases.py`
- Create: `backend/tests/test_phases.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_phases.py
from unittest.mock import MagicMock
from app.agent.phases import should_transition, apply_transition


def test_interview_to_planning_on_plan_create():
    """When create_plan tool is called, transition to planning."""
    assert should_transition(
        current_phase="interview",
        tool_called="create_plan",
    ) == "planning"


def test_no_transition_for_memory_tool():
    assert should_transition(
        current_phase="interview",
        tool_called="recall_about_user",
    ) is None


def test_planning_to_teaching_on_approval():
    """When user approves the plan, transition to teaching."""
    assert should_transition(
        current_phase="planning",
        user_approved_plan=True,
    ) == "teaching"


def test_no_transition_teaching():
    assert should_transition(
        current_phase="teaching",
        tool_called="update_plan_progress",
    ) is None


def test_apply_transition_updates_thread():
    mock_db = MagicMock()
    mock_collection = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    mock_db.threads = MagicMock(return_value=mock_collection)

    apply_transition(
        db_threads=mock_collection,
        thread_id="t1",
        new_phase="teaching",
    )

    mock_collection.update_one.assert_called_once()
    call_args = mock_collection.update_one.call_args
    assert call_args[0][0] == {"_id": "t1"}
    assert call_args[0][1]["$set"]["phase"] == "teaching"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_phases.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Implement phase transition logic**

```python
# backend/app/agent/phases.py
"""Phase transition logic for the study plan agent."""

from __future__ import annotations

from app.models.base import utcnow


# Tools that trigger phase transitions
_TRANSITION_TRIGGERS = {
    ("interview", "create_plan"): "planning",
}


def should_transition(
    *,
    current_phase: str,
    tool_called: str | None = None,
    user_approved_plan: bool = False,
) -> str | None:
    """Determine if a phase transition should occur. Returns new phase or None."""
    if tool_called:
        return _TRANSITION_TRIGGERS.get((current_phase, tool_called))

    if current_phase == "planning" and user_approved_plan:
        return "teaching"

    return None


def apply_transition(
    *,
    db_threads,
    thread_id: str,
    new_phase: str,
    interview_context: dict | None = None,
) -> None:
    """Apply a phase transition to a thread in MongoDB."""
    update: dict = {
        "phase": new_phase,
        "updated_at": utcnow(),
    }
    if interview_context is not None:
        update["interview_context"] = interview_context

    db_threads.update_one(
        {"_id": thread_id},
        {"$set": update},
    )
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_phases.py -v`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add backend/app/agent/phases.py backend/tests/test_phases.py
git commit -m "feat: add phase transition logic"
```

---

## Task 10: Integration — Wire Phase Transitions into SSE Endpoint

**Files:**
- Modify: `backend/app/api/chat.py`

**Step 1: Add phase transition handling to the chat endpoint**

Update the `event_stream()` function in `chat.py` to:

1. After agent response, check if any tool calls happened
2. If a transition-triggering tool was called, apply the transition
3. Emit `phase_change` SSE event
4. For planning → teaching transition, detect plan approval in user message

Key changes to the `event_stream()` function:

```python
# After running the agent and getting the response:

# Check for phase transitions
from app.agent.phases import should_transition, apply_transition

# Detect plan approval (simple heuristic)
is_plan_approval = (
    phase == "planning"
    and any(word in body.content.lower() for word in ["approve", "looks good", "let's go", "start", "yes", "lgtm"])
)

new_phase = should_transition(
    current_phase=phase,
    user_approved_plan=is_plan_approval,
)

if new_phase:
    apply_transition(
        db_threads=mongo.threads(),
        thread_id=thread_id,
        new_phase=new_phase,
        interview_context=interview_ctx if new_phase == "planning" else None,
    )
    yield _sse_event({"type": "phase_change", "from": phase, "to": new_phase})
```

**Step 2: Test manually**

Run: `cd backend && uv run uvicorn main:app --reload --port 8000`

1. Create thread → interview phase
2. Chat about learning goals → agent interviews
3. Agent calls create_plan → transitions to planning
4. User says "looks good" → transitions to teaching
5. Verify SSE events show phase_change

**Step 3: Commit**

```bash
git add backend/app/api/chat.py
git commit -m "feat: wire phase transitions into SSE chat endpoint"
```

---

## Task 11: Run Full Test Suite + Cleanup

**Files:**
- Modify: various

**Step 1: Run all tests**

Run: `cd backend && uv run pytest -v`
Expected: All tests pass

**Step 2: Run linter**

Run: `cd backend && uv run ruff check .`
Fix any issues.

**Step 3: Run formatter**

Run: `cd backend && uv run ruff format .`

**Step 4: Verify the server starts**

Run: `cd backend && uv run uvicorn main:app --reload --port 8000`
Check: `curl http://localhost:8000/health` returns `{"status": "ok"}`

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: lint, format, and verify full test suite"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Install deps | `pyproject.toml` |
| 2 | Plan parser | `app/plan_parser.py`, `tests/test_plan_parser.py` |
| 3 | Tool I/O schemas | `app/agent/schemas.py`, `tests/test_schemas.py` |
| 4 | Tool implementations | `app/agent/tools.py`, `tests/test_tools.py` |
| 5 | Thread model update | `app/models/thread.py`, `tests/test_thread_model.py` |
| 6 | Phase-aware prompts | `app/agent/prompts.py`, `tests/test_prompts.py` |
| 7 | Agent factory + SSE endpoint | `app/agent/agent.py`, `app/api/chat.py`, `main.py` |
| 8 | PlanCreateTool (LLM sub-call) | `app/agent/tools.py`, `tests/test_plan_create.py` |
| 9 | Phase transition logic | `app/agent/phases.py`, `tests/test_phases.py` |
| 10 | Wire transitions into SSE | `app/api/chat.py` |
| 11 | Test suite + cleanup | various |

**Old code kept:** `app/tools/`, `app/agent/loop.py`, WebSocket endpoint in `main.py` — kept for reference/backward compat. Can be removed in a future cleanup task once the new SSE flow is validated end-to-end.
