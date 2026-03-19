"""Tool implementations for the Rabbithole learning agent.

All tools use the @function_tool decorator from the OpenAI Agents SDK.
They receive context via RunContextWrapper[AgentContext].
"""

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from app.config import PLANS_DIR, get_config, get_llm
from app.db import mongo
from app.memory import evermemos
from app.models.base import new_object_id
from app.plan_parser import parse_plan

logger = logging.getLogger(__name__)


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
    branch_suggestion: dict[str, str] | None = None
    # Phase completion tracking (set by chat.py when update_plan_progress runs)
    phase_completed: bool = False
    phase_is_final: bool = False
    next_phase_title: str = ""
    completed_phase_title: str = ""


# ── Memory Tools ────────────────────────────────────────────────────────────


def _simplify_memory(m: dict[str, Any]) -> dict[str, Any]:
    """Extract the readable text from an EverMemOS memory record."""
    text = m.get("episode") or m.get("summary") or m.get("content") or ""
    return {
        "text": text,
        "memory_type": m.get("memory_type", ""),
        "timestamp": m.get("timestamp", ""),
        "score": m.get("score", 0),
    }


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

        simplified = [_simplify_memory(m) for m in memories if _simplify_memory(m)["text"]]
        return json.dumps({"memories": simplified})
    except Exception as e:
        return json.dumps({"error": f"Memory search failed: {e}", "memories": []})


@function_tool
async def recall_memory_agentic(
    ctx: RunContextWrapper[AgentContext], query: str
) -> str:
    """Search the learner's long-term memory using intelligent agentic retrieval.

    Use this tool when the user asks about something they've learned, studied,
    or discussed before. Craft a specific, detailed query for best results.
    Do NOT call this for greetings, thanks, or casual conversation.
    """
    try:
        resp = await evermemos.search_memories(
            user_id=ctx.context.user_id,
            query=query,
            retrieve_method="agentic",
            top_k=20,
        )
        result = resp.get("result", {})
        memories = result.get("memories", [])
        profiles = result.get("profiles", [])

        profile_items = [
            {"label": p.get("category") or p.get("trait_name") or "trait", "description": p.get("description", "")}
            for p in profiles
        ]
        memory_items = [_simplify_memory(m) for m in memories if _simplify_memory(m)["text"]]

        return json.dumps({
            "profiles": profile_items,
            "memories": memory_items,
            "memory_count": len(memory_items),
            "profile_count": len(profile_items),
        })
    except Exception as e:
        logger.warning("EverMemOS agentic retrieval failed: %s", e)
        return json.dumps({"error": f"Memory search failed: {e}", "memories": [], "profiles": []})


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


def _seed_graph_from_plan(
    user_id: str, topic_slug: str, plan_data: dict[str, Any]
) -> None:
    """Upsert concept nodes and prerequisite edges from a freshly created plan."""
    now = datetime.now(timezone.utc)
    for phase in plan_data.get("phases", []):
        phase_concepts = phase.get("concepts", [])
        prev_name: str | None = None
        for concept in phase_concepts:
            name = concept["name"]
            description = concept.get("description", "")

            # Upsert concept node (don't overwrite mastery if it already exists)
            mongo.concept_mastery().update_one(
                {"user_id": user_id, "concept_name": name},
                {
                    "$setOnInsert": {
                        "mastery_score": 0.0,
                        "attempts": 0,
                        "score_history": [],
                        "strength_trend": "stable",
                        "confidence": 1.0,
                        "source": "plan",
                        "created_at": now,
                        "last_reviewed": None,
                        "last_score": 0.0,
                        "weak_subconcepts": [],
                        "related_concepts": [],
                    },
                    "$set": {
                        "domain": topic_slug,
                        "description": description,
                        "updated_at": now,
                    },
                },
                upsert=True,
            )

            # Create prerequisite edge from previous concept in phase
            if prev_name:
                mongo.concept_relationships().update_one(
                    {
                        "user_id": user_id,
                        "from_concept": prev_name,
                        "to_concept": name,
                        "type": "prerequisite_of",
                    },
                    {
                        "$setOnInsert": {
                            "weight": 1.0,
                            "source_thread": "",
                            "created_at": now,
                        },
                        "$set": {"updated_at": now},
                    },
                    upsert=True,
                )
            prev_name = name


@function_tool
async def create_plan(
    ctx: RunContextWrapper[AgentContext],
    topic: str,
    user_context: str,
    depth: str = "deep_dive",
) -> str:
    """Generate an expert-depth learning plan. Call this when you have enough context from the interview. The plan is saved and the thread transitions to planning phase."""
    llm = get_llm()

    user_message = (
        f"Create a learning plan for: {topic}\n"
        f"Learner context: {user_context}\n"
        f"Depth: {depth}"
    )

    response = await llm.chat.completions.create(
        model=get_config().planning_model,
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

    # Save structured plan data as JSON for knowledge graph
    plan_data = {
        "topic": tree.topic,
        "depth": tree.depth,
        "prior_knowledge": tree.prior_knowledge,
        "phases": [
            {
                "title": phase.title,
                "order": phase.order,
                "concepts": [
                    {
                        "name": concept.name,
                        "description": concept.description,
                        "order": concept.order,
                    }
                    for concept in phase.concepts
                ],
            }
            for phase in tree.phases
        ],
    }
    (plan_dir / "plan.json").write_text(json.dumps(plan_data, indent=2))

    # Seed knowledge graph with concepts and prerequisite edges
    _seed_graph_from_plan(ctx.context.user_id, slug, plan_data)

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
    from app.plan_parser import phase_for_concept
    phase_info = phase_for_concept(tree, concept_name)
    phase_progress = 0.0
    phase_title = ""
    is_last_in_phase = False
    is_last_phase = False
    next_phase_title = ""

    if phase_info:
        phase, _, is_last_in_phase = phase_info
        phase_progress = phase.progress
        phase_title = phase.title
        # Check if this is the last phase in the plan
        is_last_phase = phase.order == len(tree.phases)
        # Find next phase title
        if not is_last_phase:
            for p in tree.phases:
                if p.order == phase.order + 1:
                    next_phase_title = p.title
                    break

    return json.dumps({
        "updated": True,
        "concept": concept_name,
        "phase_progress": round(phase_progress, 2),
        "overall_progress": round(tree.overall_progress, 2),
        "phase_title": phase_title,
        "is_last_in_phase": is_last_in_phase,
        "is_last_phase": is_last_phase,
        "next_phase_title": next_phase_title,
    })


# ── Branch Suggestion Tool ──────────────────────────────────────────────────


@function_tool
async def suggest_branches(
    ctx: RunContextWrapper[AgentContext],
    current_topic: str,
    context: str,
) -> str:
    """Suggest 2-3 related sub-topics the learner might want to explore as rabbit holes."""
    llm = get_llm()

    response = await llm.chat.completions.create(
        model=get_config().planning_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You suggest 2-3 interesting sub-topics a curious learner might want to explore. "
                    "Return ONLY a JSON array of objects with 'topic' and 'reason' fields. "
                    "Keep reasons to one sentence. Be specific, not generic. "
                    "Example: [{\"topic\": \"...\", \"reason\": \"...\"}]"
                ),
            },
            {
                "role": "user",
                "content": f"Current topic: {current_topic}\nContext: {context}",
            },
        ],
    )

    if not response.choices:
        return json.dumps({"suggestions": [], "note": "No suggestions available"})

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


# ── Drift Management / Parked Topics Tools ────────────────────────────────


def _load_parked_topics(slug: str) -> list[dict[str, Any]]:
    """Load parked.json for a topic slug. Returns [] if missing or corrupt."""
    try:
        return json.loads((PLANS_DIR / slug / "parked.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_parked_topics(slug: str, parked: list[dict[str, Any]]) -> None:
    """Save parked topics, dropping already-surfaced entries to prevent unbounded growth."""
    active = [e for e in parked if not e.get("surfaced")]
    (PLANS_DIR / slug / "parked.json").write_text(json.dumps(active, indent=2))


@function_tool
async def park_topic(
    ctx: RunContextWrapper[AgentContext],
    question: str,
    asked_during: str,
    target_concept: str,
) -> str:
    """Park a learner's question for later when it maps to a future concept in the plan.

    Call this when the learner asks about something that will be covered later.
    The question will be surfaced when you reach that concept, creating a
    personalized callback moment.

    Args:
        question: The learner's original question or a concise summary of it.
        asked_during: The concept name the learner was studying when they asked.
        target_concept: The concept name from the plan where this should be surfaced.
    """
    slug = ctx.context.topic_slug
    if not slug:
        return json.dumps({"error": "No topic_slug set"})

    plan_path = PLANS_DIR / slug / "plan.md"
    if not plan_path.exists():
        return json.dumps({"error": "No plan found — cannot park topic"})

    # Validate that target_concept actually exists in the plan
    tree = parse_plan(plan_path.read_text())
    all_concepts = [c.name for p in tree.phases for c in p.concepts]
    # Case-insensitive match — resolve to the canonical name from the plan
    canonical_target = None
    for name in all_concepts:
        if name.lower() == target_concept.lower():
            canonical_target = name
            break
    if not canonical_target:
        return json.dumps({
            "error": f"Concept '{target_concept}' not found in plan",
            "available_concepts": all_concepts,
        })

    parked = _load_parked_topics(slug)
    parked.append({
        "question": question,
        "asked_during": asked_during,
        "target_concept": canonical_target,
        "parked_at": datetime.now(timezone.utc).isoformat(),
        "surfaced": False,
    })
    _save_parked_topics(slug, parked)

    return json.dumps({
        "status": "parked",
        "question": question,
        "target_concept": canonical_target,
        "total_parked": len(parked),
    })


@function_tool
async def get_parked_topics(
    ctx: RunContextWrapper[AgentContext],
    concept_name: str,
) -> str:
    """Retrieve parked questions for a concept. Call this when starting a new
    concept to check if the learner previously asked questions about it.

    Matching topics are automatically marked as surfaced so they won't
    appear again.
    """
    slug = ctx.context.topic_slug
    if not slug:
        return json.dumps({"error": "No topic_slug set"})

    parked = _load_parked_topics(slug)

    concept_lower = concept_name.lower()
    matching = []
    for entry in parked:
        target = entry.get("target_concept", "")
        if target.lower() == concept_lower and not entry.get("surfaced"):
            matching.append({
                "question": entry["question"],
                "asked_during": entry.get("asked_during", "unknown"),
                "parked_at": entry.get("parked_at", ""),
            })
            entry["surfaced"] = True

    if matching:
        _save_parked_topics(slug, parked)

    return json.dumps({
        "parked_topics": matching,
        "count": len(matching),
    })


# ── Branch Suggestion Tool ────────────────────────────────────────────────


@function_tool
async def offer_branch(
    ctx: RunContextWrapper[AgentContext],
    topic: str,
    reason: str,
) -> str:
    """Offer the learner a one-click option to branch into an off-topic rabbit hole.

    Call this when the learner asks about something completely unrelated to the
    current plan. The frontend will show a clickable card so the learner can
    branch out with a single click, keeping the current thread on track.

    Args:
        topic: A concise name for the off-topic subject (e.g. "Quantum Computing").
        reason: A short reason why this is worth exploring (1 sentence).
    """
    ctx.context.branch_suggestion = {"topic": topic, "reason": reason}
    return json.dumps({
        "status": "branch_offered",
        "topic": topic,
        "note": "A branch suggestion card will appear for the learner.",
    })
