"""Tool implementations for the Rabbithole learning agent.

All tools use the @function_tool decorator from the OpenAI Agents SDK.
They receive context via RunContextWrapper[AgentContext].
"""

import json
import re
from dataclasses import dataclass
from typing import Any

from agents import RunContextWrapper, function_tool
from openai import AsyncOpenAI

from app.config import PLANS_DIR, LLM_API_KEY, LLM_BASE_URL, PLANNING_MODEL
from app.memory import evermemos
from app.models.base import new_object_id
from app.plan_parser import parse_plan


@dataclass
class AgentContext:
    """Passed to every tool via RunContextWrapper."""

    user_id: str
    thread_id: str
    topic_slug: str
    group_id: str
    # Populated by present_interview tool so the SSE layer can extract it
    interview_questions: list[dict[str, Any]] | None = None
    feynman_concept: str | None = None


# ── Memory Tools ────────────────────────────────────────────────────────────


@function_tool
async def recall_memory(
    ctx: RunContextWrapper[AgentContext], query: str
) -> str:
    """Search your memory for what you know about this learner -- past sessions, struggles, preferences. Use before asking questions to avoid re-asking things you already know."""
    try:
        result = await evermemos.search_memories(
            user_id=ctx.context.user_id,
            query=query,
            retrieve_method="rrf",
            top_k=10,
        )
        memories = result.get("result", {}).get("memories", [])
        if not memories:
            return json.dumps({"memories": [], "note": "No memories found for this query."})

        simplified = []
        for m in memories:
            entry: dict[str, Any] = {}
            if "summary" in m:
                entry["summary"] = m["summary"]
            if "atomic_fact" in m:
                entry["fact"] = m["atomic_fact"]
            if "content" in m:
                entry["content"] = m["content"]
            if "episode" in m:
                entry["episode"] = m["episode"]
            simplified.append(entry)

        return json.dumps({"memories": simplified})
    except Exception as e:
        return json.dumps({"error": f"Memory search failed: {e}", "memories": []})


@function_tool
async def store_memory(
    ctx: RunContextWrapper[AgentContext], fact: str
) -> str:
    """Remember an important observation about this learner for future sessions. Store things like their preferences, struggles, background, or breakthroughs."""
    try:
        result = await evermemos.store_memory(
            message_id=new_object_id(),
            content=f"[Agent observation] {fact}",
            sender=ctx.context.user_id,
            group_id=ctx.context.group_id,
            role="assistant",
            sender_name="Feynman",
        )
        return json.dumps({
            "status": "stored",
            "evermemos_status": result.get("status", ""),
        })
    except Exception as e:
        return json.dumps({"error": f"Memory store failed: {e}"})


# ── Interview Tools ─────────────────────────────────────────────────────────


@function_tool
async def present_interview(
    ctx: RunContextWrapper[AgentContext],
    questions_json: str,
) -> str:
    """Present all interview questions to the learner at once as a modal quiz.

    questions_json must be a JSON array of objects, each with "question" (str)
    and "options" (list[str]).  Example:
    [{"question": "What is your experience?", "options": ["A) None", "B) Some", "C) A lot"]}]

    Call this ONCE with 3-5 questions. Do NOT ask questions in chat text.
    """
    try:
        questions = json.loads(questions_json)
    except json.JSONDecodeError:
        return json.dumps({"error": "Invalid JSON in questions_json"})

    if not isinstance(questions, list) or not questions:
        return json.dumps({"error": "questions_json must be a non-empty JSON array"})

    for i, q in enumerate(questions):
        if not isinstance(q, dict) or "question" not in q or "options" not in q:
            return json.dumps({"error": f"Question {i} missing 'question' or 'options' key"})
        if not isinstance(q["options"], list) or len(q["options"]) < 2:
            return json.dumps({"error": f"Question {i} must have at least 2 options"})

    ctx.context.interview_questions = questions

    return json.dumps({
        "status": "presented",
        "question_count": len(questions),
        "note": "Questions are now displayed to the learner. Wait for their answers in the next message.",
    })


# ── Plan Tools ──────────────────────────────────────────────────────────────


def _slugify(text: str) -> str:
    slug = text.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


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


@function_tool
async def create_plan(
    ctx: RunContextWrapper[AgentContext],
    topic: str,
    user_context: str,
    depth: str = "deep_dive",
) -> str:
    """Generate an expert-depth learning plan. Call this when you have enough context from the interview. The plan is saved and the thread transitions to planning phase."""
    llm = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)

    user_message = (
        f"Create a learning plan for: {topic}\n"
        f"Learner context: {user_context}\n"
        f"Depth: {depth}"
    )

    response = await llm.chat.completions.create(
        model=PLANNING_MODEL,
        messages=[
            {"role": "system", "content": PLAN_GENERATION_SYSTEM},
            {"role": "user", "content": user_message},
        ],
    )

    markdown = response.choices[0].message.content or ""

    slug = _slugify(topic)
    plan_dir = PLANS_DIR / slug
    plan_dir.mkdir(parents=True, exist_ok=True)
    (plan_dir / "notes").mkdir(exist_ok=True)
    (plan_dir / "plan.md").write_text(markdown)

    tree = parse_plan(markdown)
    concept_count = sum(len(p.concepts) for p in tree.phases)

    return json.dumps({
        "plan_content": markdown,
        "plan_path": str(plan_dir / "plan.md"),
        "concept_count": concept_count,
        "phase_count": len(tree.phases),
        "topic_slug": slug,
    })


@function_tool
async def read_plan(
    ctx: RunContextWrapper[AgentContext], topic_slug: str = ""
) -> str:
    """Read the current learning plan to see progress and find the next concept to teach."""
    slug = topic_slug or ctx.context.topic_slug
    if not slug:
        return json.dumps({"error": "No topic_slug available"})

    plan_path = PLANS_DIR / slug / "plan.md"
    if not plan_path.exists():
        return json.dumps({"error": f"No plan found for '{slug}'"})

    content = plan_path.read_text()
    tree = parse_plan(content)
    current = tree.first_uncompleted_concept()
    completed = sum(1 for p in tree.phases for c in p.concepts if c.completed)
    total = sum(len(p.concepts) for p in tree.phases)

    return json.dumps({
        "plan_content": content,
        "progress": f"{completed}/{total} concepts completed",
        "current_concept": current.name if current else None,
        "overall_progress": tree.overall_progress,
    })


@function_tool
async def update_plan_progress(
    ctx: RunContextWrapper[AgentContext], concept_name: str
) -> str:
    """Mark a concept as completed in the learning plan after the learner demonstrates understanding."""
    slug = ctx.context.topic_slug
    if not slug:
        return json.dumps({"error": "No topic_slug set"})

    plan_path = PLANS_DIR / slug / "plan.md"
    if not plan_path.exists():
        return json.dumps({"error": "Plan not found"})

    content = plan_path.read_text()

    # Try exact match first, then bold-wrapped variant
    matched = False
    for variant in [concept_name, f"**{concept_name}**"]:
        old = f"- [ ] {variant}"
        if old in content:
            content = content.replace(old, f"- [x] {variant}", 1)
            plan_path.write_text(content)
            matched = True
            break

    if not matched:
        return json.dumps({"updated": False, "concept": concept_name, "reason": "Not found or already completed"})

    tree = parse_plan(content)
    phase_progress = 0.0
    stripped_name = concept_name.strip("*")
    for phase in tree.phases:
        for concept in phase.concepts:
            if concept.name == stripped_name or concept.name == concept_name:
                phase_progress = phase.progress
                break

    return json.dumps({
        "updated": True,
        "concept": concept_name,
        "phase_progress": round(phase_progress, 2),
        "overall_progress": round(tree.overall_progress, 2),
    })


# ── Branch Suggestion Tool ──────────────────────────────────────────────────


@function_tool
async def suggest_branches(
    ctx: RunContextWrapper[AgentContext],
    current_topic: str,
    context: str,
) -> str:
    """Suggest 2-3 related sub-topics the learner might want to explore as rabbit holes."""
    llm = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)

    response = await llm.chat.completions.create(
        model=PLANNING_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You suggest 2-3 interesting sub-topics a curious learner might want to explore. "
                    "Return a JSON array of objects with 'topic' and 'reason' fields. "
                    "Keep reasons to one sentence. Be specific, not generic."
                ),
            },
            {
                "role": "user",
                "content": f"Current topic: {current_topic}\nContext: {context}",
            },
        ],
        response_format={"type": "json_object"},
    )

    return response.choices[0].message.content or "[]"


@function_tool
async def trigger_feynman(
    ctx: RunContextWrapper[AgentContext],
    concept_name: str,
) -> str:
    """Trigger Feynman mode for a concept. Opens a writing interface where the learner
    explains the concept in their own words. Call this after finishing a subsection
    to test the learner's understanding."""
    ctx.context.feynman_concept = concept_name
    return f"Feynman mode triggered for '{concept_name}'. The learner will now write their explanation."
