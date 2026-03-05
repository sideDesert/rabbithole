"""Tool implementations for the Learning OS agent."""

import re
from pathlib import Path

from atomic_agents import BaseTool, BaseToolConfig
from openai import OpenAI

from app.agent.schemas import (
    BranchSuggestionInput,
    BranchSuggestionOutput,
    InterviewInput,
    InterviewOutput,
    InterviewQuestion,
    MemoryRecallInput,
    MemoryRecallOutput,
    MemoryStoreInput,
    MemoryStoreOutput,
    PlanCreateInput,
    PlanCreateOutput,
    PlanReadInput,
    PlanReadOutput,
    PlanUpdateInput,
    PlanUpdateOutput,
    WebSearchInput,
    WebSearchOutput,
)
from app.plan_parser import parse_plan


# ── Memory Tools ────────────────────────────────────────────────────────────


class MemoryRecallTool(BaseTool[MemoryRecallInput, MemoryRecallOutput]):
    """Recall memories from EverMemOS."""

    def run(self, params: MemoryRecallInput) -> MemoryRecallOutput:
        # TODO: integrate with EverMemOS
        return MemoryRecallOutput(memories=[])


class MemoryStoreTool(BaseTool[MemoryStoreInput, MemoryStoreOutput]):
    """Store a fact into EverMemOS."""

    def run(self, params: MemoryStoreInput) -> MemoryStoreOutput:
        # TODO: integrate with EverMemOS
        return MemoryStoreOutput(status="stored")


# ── Interview Tool ──────────────────────────────────────────────────────────


class InterviewTool(BaseTool[InterviewInput, InterviewOutput]):
    """Generate interview questions for learner assessment."""

    def run(self, params: InterviewInput) -> InterviewOutput:
        # TODO: use LLM sub-call for real question generation
        question = InterviewQuestion(
            text=f"Tell me what you already know about: {params.purpose}",
            context=params.purpose,
        )
        return InterviewOutput(questions=[question])


# ── Plan Tools ──────────────────────────────────────────────────────────────


class PlanToolConfig(BaseToolConfig):
    """Config for plan tools that need a plans directory."""

    plans_dir: Path = Path("plans")


class PlanReadTool(BaseTool[PlanReadInput, PlanReadOutput]):
    """Read and parse a learning plan from the filesystem."""

    config: PlanToolConfig

    def __init__(self, config: PlanToolConfig | None = None):
        super().__init__(config=config or PlanToolConfig())

    def run(self, params: PlanReadInput) -> PlanReadOutput:
        plan_path = self.config.plans_dir / params.topic_slug / "plan.md"
        content = plan_path.read_text()
        tree = parse_plan(content)

        current = tree.first_uncompleted_concept()
        completed = sum(
            1 for p in tree.phases for c in p.concepts if c.completed
        )
        total = sum(len(p.concepts) for p in tree.phases)
        progress = f"{completed}/{total} concepts completed"

        return PlanReadOutput(
            plan_content=content,
            progress=progress,
            current_concept=current.name if current else None,
            overall_progress=tree.overall_progress,
        )


class PlanUpdateTool(BaseTool[PlanUpdateInput, PlanUpdateOutput]):
    """Mark a concept as completed in a learning plan."""

    config: PlanToolConfig

    def __init__(self, config: PlanToolConfig | None = None):
        super().__init__(config=config or PlanToolConfig())

    def run(self, params: PlanUpdateInput) -> PlanUpdateOutput:
        plan_path = self.config.plans_dir / params.topic_slug / "plan.md"
        content = plan_path.read_text()

        old = f"- [ ] {params.concept_name}"
        new = f"- [x] {params.concept_name}"

        if old not in content:
            return PlanUpdateOutput(
                updated=False,
                concept=params.concept_name,
                phase_progress=0.0,
                overall_progress=0.0,
            )

        content = content.replace(old, new, 1)
        plan_path.write_text(content)

        tree = parse_plan(content)

        # Find the phase containing this concept for phase_progress
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


# ── Plan Create Tool ───────────────────────────────────────────────────────


def _slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    slug = text.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug


PLAN_GENERATION_SYSTEM = """\
You are an expert curriculum designer. Generate a detailed markdown learning plan.

Rules:
- Cover history, motivation, internals, and "why before how"
- Use this exact format for concepts: `- [ ] Name — description`
- Use this exact format for phases: `## Phase N: Title`
- Include a metadata blockquote at the top: `> **Depth:** <depth> | **Prior knowledge:** <context>`
- Start with a top-level heading: `# <Topic>`
- Adapt the number of concepts per phase based on the depth parameter:
  - overview: 3-5 concepts per phase, 2-3 phases
  - deep_dive: 5-8 concepts per phase, 4-6 phases
  - mastery: 8-12 concepts per phase, 6-10 phases
- Each concept should be a meaningful, teachable unit
- Order concepts from foundational to advanced within each phase
"""


class PlanCreateTool(BaseTool[PlanCreateInput, PlanCreateOutput]):
    """Generate a learning plan via LLM sub-call and write it to the filesystem."""

    config: PlanToolConfig

    def __init__(
        self,
        plans_dir: Path | None = None,
        llm_client: OpenAI | None = None,
    ):
        from app.config import PLANS_DIR

        config = PlanToolConfig(plans_dir=plans_dir or PLANS_DIR)
        super().__init__(config=config)

        if llm_client is not None:
            self._llm_client = llm_client
        else:
            from app.config import OPENROUTER_API, OPENROUTER_BASE_URL

            self._llm_client = OpenAI(
                base_url=OPENROUTER_BASE_URL,
                api_key=OPENROUTER_API,
            )

    def run(self, params: PlanCreateInput) -> PlanCreateOutput:
        from app.config import PLANNING_MODEL

        user_message = (
            f"Create a learning plan for: {params.topic}\n"
            f"Learner context: {params.user_context}\n"
            f"Depth: {params.depth}"
        )

        response = self._llm_client.chat.completions.create(
            model=PLANNING_MODEL,
            messages=[
                {"role": "system", "content": PLAN_GENERATION_SYSTEM},
                {"role": "user", "content": user_message},
            ],
        )

        markdown = response.choices[0].message.content or ""

        slug = _slugify(params.topic)
        plan_dir = self.config.plans_dir / slug
        plan_dir.mkdir(parents=True, exist_ok=True)
        (plan_dir / "notes").mkdir(exist_ok=True)

        plan_path = plan_dir / "plan.md"
        plan_path.write_text(markdown)

        tree = parse_plan(markdown)
        concept_count = sum(len(p.concepts) for p in tree.phases)
        phase_count = len(tree.phases)

        return PlanCreateOutput(
            plan_content=markdown,
            plan_path=str(plan_path),
            concept_count=concept_count,
            phase_count=phase_count,
        )


# ── Web Search Tool ─────────────────────────────────────────────────────────


class WebSearchTool(BaseTool[WebSearchInput, WebSearchOutput]):
    """Search the web for learning resources."""

    def run(self, params: WebSearchInput) -> WebSearchOutput:
        # TODO: integrate with search provider
        return WebSearchOutput(results=[])


# ── Branch Suggestion Tool ──────────────────────────────────────────────────


class BranchSuggestionTool(BaseTool[BranchSuggestionInput, BranchSuggestionOutput]):
    """Suggest topic branches for deeper exploration."""

    def run(self, params: BranchSuggestionInput) -> BranchSuggestionOutput:
        # TODO: use LLM to generate meaningful branch suggestions
        return BranchSuggestionOutput(suggestions=[])
