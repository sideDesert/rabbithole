"""Parse markdown learning plans into a simple tree structure."""

import re
from dataclasses import dataclass, field


def _strip_md(text: str) -> str:
    """Strip common markdown inline formatting (bold, italic) from text."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"_(.+?)_", r"\1", text)
    return text.strip()


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
    depth: str
    prior_knowledge: str
    phases: list[PlanPhase] = field(default_factory=list)

    @property
    def overall_progress(self) -> float:
        all_concepts = [c for p in self.phases for c in p.concepts]
        if not all_concepts:
            return 0.0
        return sum(1 for c in all_concepts if c.completed) / len(all_concepts)

    def first_uncompleted_concept(self) -> PlanConcept | None:
        for phase in self.phases:
            for concept in phase.concepts:
                if not concept.completed:
                    return concept
        return None


def phase_for_concept(
    tree: PlanTree, concept_name: str
) -> tuple[PlanPhase, PlanConcept, bool] | None:
    """Find the phase containing a concept and whether it's the last uncompleted concept in that phase.

    Returns (phase, concept, is_last_in_phase) or None if not found.
    is_last_in_phase is True when marking this concept complete would make phase.progress == 1.0.
    """
    stripped = concept_name.strip("*")
    for phase in tree.phases:
        for concept in phase.concepts:
            if concept.name == stripped or concept.name == concept_name:
                # Count remaining uncompleted concepts (excluding the one being completed)
                remaining = sum(
                    1 for c in phase.concepts
                    if not c.completed and c.name != concept.name
                )
                return phase, concept, remaining == 0
    return None


def parse_plan(markdown: str) -> PlanTree:
    """Parse a markdown learning plan into a PlanTree."""
    lines = markdown.strip().splitlines()

    topic = ""
    depth = ""
    prior_knowledge = ""
    phases: list[PlanPhase] = []

    for line in lines:
        stripped = line.strip()

        # Topic: first H1
        if stripped.startswith("# ") and not topic:
            topic = _strip_md(stripped[2:])

        # Metadata lines starting with >
        elif stripped.startswith(">"):
            content = stripped[1:].strip()
            for part in content.split("|"):
                part = part.strip()
                if part.startswith("**Depth:**"):
                    depth = part[len("**Depth:**"):].strip()
                elif part.startswith("**Prior knowledge:**"):
                    prior_knowledge = part[len("**Prior knowledge:**"):].strip()

        # Phase header: ## Phase N: Title
        elif stripped.startswith("## Phase"):
            # "## Phase 1: Phase Title" -> "Phase Title"
            colon_idx = stripped.find(":")
            raw_title = stripped[colon_idx + 1:].strip() if colon_idx != -1 else stripped[3:].strip()
            phases.append(PlanPhase(title=_strip_md(raw_title), order=len(phases) + 1))

        # Concept: - [ ] Name — description  or  - [x] Name — description
        elif stripped.startswith("- [") and phases:
            completed = stripped.startswith("- [x]")
            text = stripped[6:].strip()  # skip "- [ ] " or "- [x] "
            if " — " in text:
                raw_name, raw_desc = text.split(" — ", 1)
            else:
                raw_name, raw_desc = text, ""
            concept_order = len(phases[-1].concepts) + 1
            phases[-1].concepts.append(
                PlanConcept(name=_strip_md(raw_name), description=_strip_md(raw_desc), completed=completed, order=concept_order)
            )

    return PlanTree(topic=topic, depth=depth, prior_knowledge=prior_knowledge, phases=phases)
