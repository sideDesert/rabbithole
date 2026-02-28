"""Plan lifecycle tools — create, read, and update learning plans."""

import re

from app.config import PLANS_DIR, PLANNING_MODEL
from app.agent.prompts import PLANNING_PROMPT
from app.schemas.plans import LearningPlan
from app.tools.registry import tool_registry, ToolContext


def _plan_to_markdown(plan: LearningPlan) -> str:
    """Convert a LearningPlan to markdown format."""
    lines = [
        f"# Learning Plan: {plan.topic}",
        "",
        f"**Learner Level:** {plan.learner_level}",
        "",
        "## Concepts",
        "",
    ]
    for c in plan.concepts:
        prereqs = f" _Requires: {', '.join(c.prerequisites)}_" if c.prerequisites else " _No prerequisites._"
        lines.append(f"- [ ] **{c.name}** — {c.description}.{prereqs}")

    if plan.notes:
        lines.extend(["", "## Notes", "", plan.notes])

    lines.append("")
    return "\n".join(lines)


@tool_registry.register(
    agents=["feynman"],
    description="Generate a structured learning plan for a topic. Uses an internal LLM call to create the plan, then saves it as markdown.",
    parameters={
        "type": "object",
        "properties": {
            "topic": {
                "type": "string",
                "description": "The topic to create a learning plan for",
            },
            "user_context": {
                "type": "string",
                "description": "What you know about the learner (level, goals, background)",
            },
            "topic_slug": {
                "type": "string",
                "description": "URL-safe slug for the topic, e.g. 'rust-ownership'",
            },
        },
        "required": ["topic", "user_context", "topic_slug"],
    },
)
async def create_learning_plan(
    topic: str, user_context: str, topic_slug: str, *, ctx: ToolContext
) -> dict:
    # Call the planning sub-agent
    response = ctx.llm_client.chat.completions.create(
        model=PLANNING_MODEL,
        messages=[
            {"role": "system", "content": PLANNING_PROMPT},
            {
                "role": "user",
                "content": f"Create a learning plan for: {topic}\n\nLearner context: {user_context}",
            },
        ],
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or "{}"
    plan = LearningPlan.model_validate_json(raw)

    # Save to filesystem
    plan_dir = PLANS_DIR / topic_slug
    plan_dir.mkdir(parents=True, exist_ok=True)
    (plan_dir / "notes").mkdir(exist_ok=True)

    plan_md = _plan_to_markdown(plan)
    (plan_dir / "plan.md").write_text(plan_md)

    # Update thread with topic_slug
    from app.db import mongo
    mongo.threads().update_one(
        {"_id": ctx.thread_id},
        {"$set": {"topic_slug": topic_slug}},
    )

    return {
        "plan": plan.model_dump(),
        "plan_path": str(plan_dir / "plan.md"),
        "concept_count": len(plan.concepts),
    }


@tool_registry.register(
    agents=["feynman", "ebbinghaus"],
    description="Read the current learning plan to see what topic comes next.",
    parameters={
        "type": "object",
        "properties": {},
    },
)
async def get_current_plan(*, ctx: ToolContext) -> dict:
    if not ctx.topic_slug:
        return {"error": "No topic_slug set on this thread"}

    plan_path = PLANS_DIR / ctx.topic_slug / "plan.md"
    if not plan_path.exists():
        return {"error": f"No plan found at {plan_path}"}

    content = plan_path.read_text()

    # Parse progress
    checked = content.count("- [x]")
    unchecked = content.count("- [ ]")
    total = checked + unchecked

    return {
        "content": content,
        "progress": f"{checked}/{total} concepts completed",
    }


@tool_registry.register(
    agents=["feynman"],
    description="Mark a concept as completed in the learning plan.",
    parameters={
        "type": "object",
        "properties": {
            "concept_name": {
                "type": "string",
                "description": "The exact concept name to mark as done",
            },
        },
        "required": ["concept_name"],
    },
)
async def update_plan_progress(concept_name: str, *, ctx: ToolContext) -> dict:
    if not ctx.topic_slug:
        return {"error": "No topic_slug set on this thread"}

    plan_path = PLANS_DIR / ctx.topic_slug / "plan.md"
    if not plan_path.exists():
        return {"error": f"No plan found at {plan_path}"}

    content = plan_path.read_text()

    # Find and toggle the checkbox for this concept
    pattern = rf"- \[ \] \*\*{re.escape(concept_name)}\*\*"
    replacement = f"- [x] **{concept_name}**"

    new_content, count = re.subn(pattern, replacement, content)
    if count == 0:
        return {"error": f"Concept '{concept_name}' not found in plan (or already completed)"}

    plan_path.write_text(new_content)

    return {"status": "updated", "concept": concept_name}
