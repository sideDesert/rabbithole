"""SSE streaming chat endpoint powered by OpenAI Agents SDK.

Flow:
1. User sends message via POST
2. We load thread, build a phase-specific Agent
3. Runner.run_streamed() handles the LLM + tool-calling loop
4. Stream events are forwarded as SSE to the client
5. Final response and phase transitions are persisted
"""

import json
import logging
import time
import uuid
from typing import Literal

from agents import ItemHelpers, Runner
from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from openai.types.responses import EasyInputMessageParam, ResponseTextDeltaEvent
from pydantic import BaseModel

from app.agent.phases import apply_transition, should_transition
from app.agent_core import build_agent
from app.config import (
    COMPACTION_THRESHOLD,
    DEFAULT_MODEL,
    LLM_API_KEY,
    LLM_BASE_URL,
    PLANS_DIR,
    get_model_context_window,
)
from app.db import mongo
from app.models.base import new_object_id, utcnow
from app.models.branch_point import BranchPoint, TextPosition
from app.models.message import Message
from app.models.thread import Thread
from app.plan_parser import parse_plan
from app.services.concept_extractor import extract_and_update_graph
from app.services.memory_graph_extractor import extract_memory_graph
from app.tools_impl import AgentContext

MessageRole = Literal["user", "assistant", "system"]

router = APIRouter(prefix="/api", tags=["chat"])
logger = logging.getLogger(__name__)

llm = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)


# ── Request/Response models ───────────────────────────────────────────────


class ChatRequest(BaseModel):
    content: str


class BranchRequest(BaseModel):
    message_id: str
    branch_type: Literal["highlight", "explore", "suggested"]
    branch_text: str
    position_start: int | None = None
    position_end: int | None = None
    title: str | None = None


class ToggleConceptRequest(BaseModel):
    concept_name: str
    completed: bool


# ── Helpers ───────────────────────────────────────────────────────────────


def sse(data: dict[str, object]) -> str:
    return f"data: {json.dumps(data)}\n\n"


def load_history(thread_id: str) -> list[EasyInputMessageParam]:
    """Load all messages from MongoDB as OpenAI message dicts."""
    docs = list(
        mongo.messages()
        .find({"thread_id": thread_id})
        .sort("created_at", 1)
    )
    messages: list[EasyInputMessageParam] = []
    for doc in docs:
        msg_type = str(doc.get("type", "text"))
        if msg_type in ("tool_call", "tool_result"):
            continue

        raw = doc.get("content", "")
        text = str(raw) if isinstance(raw, str) else json.dumps(raw)
        role = str(doc["role"])
        if role not in ("user", "assistant", "system", "developer"):
            continue
        messages.append({"role": role, "content": text})
    return messages


def load_parent_context(thread: dict[str, object]) -> list[EasyInputMessageParam]:
    """For branch threads, load the full parent conversation as structured context.

    Returns a system message with the parent transcript. The source message
    (where the learner highlighted text) has the selection wrapped in
    <highlighted> tags. The branch thread's own messages — including the
    user's query — are loaded separately as the prompt.

    If the parent's cumulative input tokens exceed COMPACTION_THRESHOLD of the
    model's context window, we skip full history injection and let the agent
    rely on the compacted parent_summary in its system prompt instead.
    """
    parent_id = thread.get("parent_thread_id")
    if not parent_id:
        return []

    parent = mongo.threads().find_one({"_id": str(parent_id)})
    if not parent:
        return []

    # Check if parent conversation is too large for full injection
    parent_token_usage = parent.get("token_usage", {})
    parent_input_tokens = (
        parent_token_usage.get("input_tokens", 0)
        if isinstance(parent_token_usage, dict)
        else 0
    )
    context_window = get_model_context_window()
    if parent_input_tokens > context_window * COMPACTION_THRESHOLD:
        logger.info(
            "[chat] parent too large (%d tokens > %d threshold), using summary",
            parent_input_tokens,
            int(context_window * COMPACTION_THRESHOLD),
        )
        return []

    parent_history = load_history(str(parent_id))
    if not parent_history:
        return []

    # Fetch the source message to identify and mark the highlighted text
    source_msg_id = str(thread.get("branch_source_message_id", ""))
    highlighted_text = str(thread.get("branch_text", ""))
    source_doc = (
        mongo.messages().find_one({"_id": source_msg_id}) if source_msg_id else None
    )
    source_content = ""
    if source_doc:
        raw = source_doc.get("content", "")
        source_content = str(raw) if isinstance(raw, str) else json.dumps(raw)

    # Build transcript — mark highlighted text in the source message
    lines: list[str] = []
    for msg in parent_history:
        role = str(msg.get("role", ""))
        content = str(msg.get("content", ""))
        if role not in ("user", "assistant") or not content:
            continue

        if source_content and content == source_content and highlighted_text:
            content = content.replace(
                highlighted_text,
                f"<highlighted>{highlighted_text}</highlighted>",
                1,
            )

        lines.append(f'<message role="{role}">{content}</message>')

    transcript = "\n".join(lines)
    context_msg = (
        "The learner branched from the following conversation. "
        "The text they highlighted is wrapped in <highlighted> tags.\n\n"
        f"<parent-conversation>\n{transcript}\n</parent-conversation>"
    )
    return [{"role": "system", "content": context_msg}]


def save_message(
    *,
    user_id: str,
    thread_id: str,
    role: MessageRole,
    content: str,
    msg_type: Literal[
        "text",
        "markdown",
        "feynman_input",
        "tool_call",
        "tool_result",
        "plan_card",
        "interview_questions",
    ],
    group_id: str,
    index: int,
) -> str:
    msg = Message(
        user_id=user_id,
        thread_id=thread_id,
        role=role,
        content=content,
        type=msg_type,
        group_id=group_id,
        index=index,
    )
    _ = mongo.messages().insert_one(msg.to_doc())
    return msg.id


def get_plan_context(topic_slug: str | None) -> tuple[str | None, str | None]:
    if not topic_slug:
        return None, None
    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return None, None
    content = plan_path.read_text()
    tree = parse_plan(content)
    first = tree.first_uncompleted_concept()
    return content, (first.name if first else None)


COMPACTION_PROMPT = """\
You will receive a learning conversation and a highlighted branch text. Respond in exactly this format:

TITLE: <short title for the branch, 4-8 words, based on the branch text>
SUMMARY:
<2-3 short paragraphs summarizing the conversation so far — what topic is being studied, \
what has been covered, what the learner understands well, and what they were struggling with. \
Keep it factual and concise — this summary will be used as context for the branch conversation.>
"""

TITLE_GENERATION_PROMPT = """\
Generate a concise title (4-8 words) for this learning conversation. \
Return ONLY the title, no quotes or punctuation wrapping."""


def clean_title(raw: str) -> str:
    """Strip quotes, trailing periods, and cap at 80 chars."""
    title = raw.strip().strip("\"'`").rstrip(".")
    return title[:80]


async def generate_thread_title(user_msg: str, assistant_msg: str) -> str:
    """Generate a concise thread title from the first exchange."""
    try:
        response = await llm.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": TITLE_GENERATION_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"User: {user_msg[:300]}\n\n"
                        f"Assistant: {assistant_msg[:300]}"
                    ),
                },
            ],
            max_tokens=30,
        )
        raw = response.choices[0].message.content or ""
        title = clean_title(raw)
        return title if title else user_msg[:100]
    except Exception as e:
        logger.warning("[chat] title generation failed: %s", e)
        return user_msg[:100]


async def compact_parent_context(
    history: list[EasyInputMessageParam],
    branch_text: str,
    parent_title: str,
) -> tuple[str, str]:
    """Return (title, summary) for a branch conversation."""
    lines: list[str] = []
    for msg in history:
        role = msg.get("role", "")
        raw_content = msg.get("content", "")
        content = raw_content if isinstance(raw_content, str) else str(raw_content)
        if role in ("user", "assistant") and content:
            speaker = "Learner" if role == "user" else "Teacher"
            if len(content) > 500:
                content = content[:500] + "..."
            lines.append(f"{speaker}: {content}")

    transcript = "\n".join(lines)
    response = await llm.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": COMPACTION_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Topic: {parent_title}\n"
                    f"Branch text: {branch_text}\n\n"
                    f"Conversation:\n{transcript}"
                ),
            },
        ],
        max_tokens=350,
    )
    raw = response.choices[0].message.content or ""

    # Parse structured response
    title = branch_text[:80]
    summary = raw
    if "TITLE:" in raw and "SUMMARY:" in raw:
        title_part, summary_part = raw.split("SUMMARY:", 1)
        title = title_part.replace("TITLE:", "").strip() or title
        summary = summary_part.strip() or "No summary available."

    return title, summary


# ── Thread CRUD Endpoints ─────────────────────────────────────────────────


@router.post("/threads")
async def create_thread(req: ChatRequest):
    from app.memory import evermemos

    user_id = "user_001"
    group_id = str(uuid.uuid4())
    thread = Thread(
        user_id=user_id,
        title=req.content[:100],
        topic_slug="",
        evermemos_group_id=group_id,
        phase="interview",
    )
    thread.root_thread_id = thread.id
    _ = mongo.threads().insert_one(thread.to_doc())

    # Register conversation metadata so EverMemOS knows the scene type
    await evermemos.ensure_conversation_meta(group_id=group_id, user_id=user_id)

    return {"thread_id": thread.id, "phase": "interview"}


@router.get("/threads")
def list_threads():
    docs = list(
        mongo.threads().find({"user_id": "user_001"}).sort("updated_at", -1).limit(50)
    )
    for doc in docs:
        doc["id"] = doc.pop("_id", "")
    return {"threads": docs}


@router.get("/threads/tree")
def get_all_trees():
    """Return branch trees for all root threads belonging to the user."""
    user_id = "user_001"
    all_threads = list(mongo.threads().find({"user_id": user_id}))

    by_parent: dict[str, list[str]] = {}
    thread_map: dict[str, dict[str, object]] = {}
    root_ids: list[str] = []

    for t in all_threads:
        tid = str(t["_id"])
        thread_map[tid] = t
        pid = t.get("parent_thread_id")
        if pid:
            by_parent.setdefault(str(pid), []).append(tid)
        else:
            root_ids.append(tid)

    def build_node(tid: str) -> dict[str, object]:
        t = thread_map.get(tid, {})
        return {
            "thread_id": tid,
            "title": t.get("title", ""),
            "status": t.get("status", ""),
            "phase": t.get("phase", ""),
            "depth": t.get("depth", 0),
            "updated_at": str(t.get("updated_at", "")),
            "children": [build_node(cid) for cid in by_parent.get(tid, [])],
        }

    trees = [build_node(rid) for rid in root_ids]
    trees.sort(key=lambda t: str(t.get("updated_at", "")), reverse=True)
    return {"trees": trees}


@router.get("/threads/study-topics")
def get_study_topics(limit: int | None = None):
    """Return every thread as a study topic entry, with progress info."""
    user_id = "user_001"
    all_threads = list(mongo.threads().find({"user_id": user_id, "agent": "feynman"}))

    # Build a map so we can look up root threads for topic name
    thread_map: dict[str, dict[str, object]] = {}
    for t in all_threads:
        thread_map[str(t["_id"])] = t

    # Group threads by root_thread_id, keeping the most recently updated per group
    groups: dict[str, list[dict[str, object]]] = {}
    for t in all_threads:
        root_id = str(t.get("root_thread_id") or t["_id"])
        groups.setdefault(root_id, []).append(t)

    topics = []
    for root_id, group_threads in groups.items():
        # Sort group by updated_at descending to find the latest thread
        group_threads.sort(key=lambda x: str(x.get("updated_at", "")), reverse=True)
        latest = group_threads[0]
        root = thread_map.get(root_id, latest)
        root_title = str(root.get("title", ""))
        topic_slug = str(latest.get("topic_slug", "") or root.get("topic_slug", ""))

        # Get progress from plan if available
        progress = 0.0
        current_concept = str(latest.get("current_concept", "") or "")
        if topic_slug:
            plan_path = PLANS_DIR / topic_slug / "plan.md"
            if plan_path.exists():
                tree = parse_plan(plan_path.read_text())
                progress = tree.overall_progress
                if not current_concept:
                    first = tree.first_uncompleted_concept()
                    if first:
                        current_concept = first.name

        # Use the root thread's phase (authoritative), fall back to latest
        phase = str(root.get("phase", latest.get("phase", "interview")))

        topics.append({
            "root_thread_id": root_id,
            "topic": root_title,
            "topic_slug": topic_slug,
            "current_concept": current_concept or None,
            "progress": progress,
            "phase": phase,
            "latest_thread": {
                "id": str(latest["_id"]),
                "title": str(latest.get("title", "")),
                "updated_at": str(latest.get("updated_at", "")),
            },
        })

    # Sort by most recently active
    topics.sort(key=lambda t: t["latest_thread"]["updated_at"], reverse=True)  # type: ignore[index]
    if limit is not None:
        topics = topics[:limit]
    return {"topics": topics}


@router.delete("/threads/{thread_id}")
def delete_thread(thread_id: str):
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "not found"}
    _ = mongo.messages().delete_many({"thread_id": thread_id})
    _ = mongo.branch_points().delete_many(
        {"$or": [{"parent_thread_id": thread_id}, {"child_thread_id": thread_id}]}
    )
    _ = mongo.threads().delete_one({"_id": thread_id})
    return {"deleted": True}


@router.get("/threads/{thread_id}")
def get_thread(thread_id: str):
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "not found"}
    doc["id"] = doc.pop("_id", "")
    return doc


@router.get("/threads/{thread_id}/progress")
def get_progress(thread_id: str):
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "not found"}
    topic_slug = str(doc.get("topic_slug", ""))
    if not topic_slug:
        return {"progress": 0, "phases": list[object]()}
    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"progress": 0, "phases": list[object]()}
    tree = parse_plan(plan_path.read_text())
    first = tree.first_uncompleted_concept()
    return {
        "topic": tree.topic,
        "depth": tree.depth,
        "prior_knowledge": tree.prior_knowledge,
        "overall_progress": tree.overall_progress,
        "current_concept": first.name if first else None,
        "phases": [
            {
                "title": p.title,
                "order": p.order,
                "progress": p.progress,
                "concepts": [
                    {
                        "name": c.name,
                        "description": c.description,
                        "completed": c.completed,
                        "order": c.order,
                    }
                    for c in p.concepts
                ],
            }
            for p in tree.phases
        ],
    }


@router.get("/threads/{thread_id}/plan")
def get_plan(thread_id: str):
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "not found"}
    topic_slug = str(doc.get("topic_slug", ""))
    if not topic_slug:
        return {"markdown": None, "topic_slug": None}
    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"markdown": None, "topic_slug": topic_slug}
    return {"markdown": plan_path.read_text(), "topic_slug": topic_slug}


@router.patch("/threads/{thread_id}/plan/toggle")
def toggle_concept(thread_id: str, req: ToggleConceptRequest):
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "Thread not found"}
    topic_slug = str(doc.get("topic_slug", ""))
    if not topic_slug:
        return {"error": "No plan associated with this thread"}

    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"error": "Plan file not found"}

    content = plan_path.read_text()
    name = req.concept_name
    check_from = "- [ ]" if req.completed else "- [x]"
    check_to = "- [x]" if req.completed else "- [ ]"

    # Try exact match first, then bold-wrapped variant
    for variant in [name, f"**{name}**"]:
        old = f"{check_from} {variant}"
        if old in content:
            new = f"{check_to} {variant}"
            content = content.replace(old, new, 1)
            _ = plan_path.write_text(content)
            break
    else:
        return {
            "toggled": False,
            "reason": "Concept not found or already in target state",
        }

    tree = parse_plan(content)
    return {
        "toggled": True,
        "concept": req.concept_name,
        "completed": req.completed,
        "overall_progress": round(tree.overall_progress, 2),
    }


@router.get("/threads/{thread_id}/messages")
def get_messages(thread_id: str):
    docs = list(
        mongo.messages()
        .find(
            {
                "thread_id": thread_id,
                "type": {
                    "$in": ["text", "markdown", "plan_card", "interview_questions"]
                },
            }
        )
        .sort("created_at", 1)
    )
    messages: list[dict[str, object]] = []
    for doc in docs:
        messages.append(
            {
                "id": str(doc.get("_id", "")),
                "role": str(doc["role"]),
                "content": str(doc["content"]),
                "type": str(doc.get("type", "text")),
            }
        )
    return {"messages": messages}


# ── Branch Endpoints ──────────────────────────────────────────────────────


async def _compact_branch_summary(
    child_thread_id: str,
    parent_thread_id: str,
    branch_text: str,
    parent_title: str,
) -> None:
    """Background task: generate a compacted summary and update the child thread."""
    try:
        history = load_history(parent_thread_id)
        generated_title, summary = await compact_parent_context(
            history=history,
            branch_text=branch_text,
            parent_title=parent_title,
        )
        mongo.threads().update_one(
            {"_id": child_thread_id},
            {"$set": {"parent_summary": summary, "title": generated_title or branch_text[:80]}},
        )
        logger.info("[branch] compaction done for child=%s", child_thread_id)
    except Exception as e:
        logger.warning("[branch] compaction failed for child=%s: %s", child_thread_id, e)


@router.post("/threads/{thread_id}/branch")
async def create_branch(
    thread_id: str, req: BranchRequest, bg: BackgroundTasks
):
    parent = mongo.threads().find_one({"_id": thread_id})
    if not parent:
        return {"error": "Thread not found"}

    msg = mongo.messages().find_one({"_id": req.message_id, "thread_id": thread_id})
    if not msg:
        return {"error": "Message not found in this thread"}

    title = req.title or req.branch_text[:80]

    # Inherit the root thread's EverMemOS group_id so all branches share one memory space
    root_id = str(parent.get("root_thread_id", thread_id))
    root = mongo.threads().find_one({"_id": root_id})
    root_group_id = str(
        (root or parent).get("evermemos_group_id", "")
    ) or str(parent.get("evermemos_group_id", ""))

    child = Thread(
        user_id=str(parent["user_id"]),
        title=title,
        topic_slug=str(parent.get("topic_slug", "")),
        phase="teaching",
        depth=int(parent.get("depth", 0)) + 1,
        parent_thread_id=thread_id,
        root_thread_id=root_id,
        evermemos_group_id=root_group_id,
        branch_text=req.branch_text,
        branch_source_message_id=req.message_id,
    )
    _ = mongo.threads().insert_one(child.to_doc())

    position = None
    if req.position_start is not None and req.position_end is not None:
        position = TextPosition(start=req.position_start, end=req.position_end)

    # Compute current_concept from plan (not persisted on thread doc)
    _, branch_source_concept = get_plan_context(parent.get("topic_slug"))

    bp = BranchPoint(
        thread_id=thread_id,
        message_id=req.message_id,
        position=position,
        type=req.branch_type,
        child_thread_id=child.id,
        source_concept=branch_source_concept,
        branch_topic=req.branch_text,
    )
    _ = mongo.branch_points().insert_one(bp.to_doc())
    _ = mongo.threads().update_one(
        {"_id": child.id}, {"$set": {"branch_point_id": bp.id}}
    )

    # Fire compaction in background — response returns immediately
    bg.add_task(
        _compact_branch_summary,
        child_thread_id=child.id,
        parent_thread_id=thread_id,
        branch_text=req.branch_text,
        parent_title=str(parent.get("title", "")),
    )

    return {
        "thread_id": child.id,
        "branch_point_id": bp.id,
        "title": title,
        "phase": "teaching",
    }


@router.post("/threads/{thread_id}/start-phase")
async def start_phase(thread_id: str):
    """Create a child thread for the first phase of the plan."""
    parent = mongo.threads().find_one({"_id": thread_id})
    if not parent:
        return {"error": "Thread not found"}

    topic_slug = str(parent.get("topic_slug", ""))
    if not topic_slug:
        return {"error": "No plan associated with this thread"}

    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"error": "Plan not found"}

    tree = parse_plan(plan_path.read_text())
    if not tree.phases:
        return {"error": "Plan has no phases"}

    first_phase = tree.phases[0]

    # Inherit the root thread's EverMemOS group_id
    root_group_id = str(parent.get("evermemos_group_id", "")) or str(uuid.uuid4())

    child = Thread(
        user_id=str(parent["user_id"]),
        title=f"Phase 1: {first_phase.title}",
        topic_slug=topic_slug,
        phase="teaching",
        depth=1,
        parent_thread_id=thread_id,
        root_thread_id=str(parent.get("root_thread_id", thread_id)),
        evermemos_group_id=root_group_id,
    )
    _ = mongo.threads().insert_one(child.to_doc())

    # Transition root thread to teaching
    apply_transition(
        db_threads=mongo.threads(),
        thread_id=thread_id,
        new_phase="teaching",
    )

    return {
        "thread_id": child.id,
        "title": child.title,
        "phase": "teaching",
        "phase_number": 1,
        "phase_title": first_phase.title,
    }


@router.post("/threads/{thread_id}/next-phase")
async def create_next_phase_thread(thread_id: str):
    """Create a sibling thread for the next phase of the plan."""
    current = mongo.threads().find_one({"_id": thread_id})
    if not current:
        return {"error": "Thread not found"}

    root_id = str(current.get("root_thread_id", current.get("parent_thread_id", "")))
    root = mongo.threads().find_one({"_id": root_id})
    if not root:
        return {"error": "Root thread not found"}

    topic_slug = str(current.get("topic_slug", "") or root.get("topic_slug", ""))
    if not topic_slug:
        return {"error": "No plan associated"}

    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"error": "Plan not found"}

    tree = parse_plan(plan_path.read_text())

    # Find the current phase by looking at which phases are complete
    next_phase = None
    current_phase_order = 0
    for phase in tree.phases:
        if phase.progress < 1.0:
            next_phase = phase
            current_phase_order = phase.order - 1
            break

    if not next_phase:
        return {"error": "All phases completed", "plan_complete": True}

    # Build context message about previous phases
    completed_phases = [p for p in tree.phases if p.progress >= 1.0]
    context_lines = []
    for p in completed_phases:
        concepts = ", ".join(c.name for c in p.concepts)
        context_lines.append(f"- Phase {p.order} ({p.title}): completed — concepts covered: {concepts}")

    phase_context = (
        f"The user has just completed {len(completed_phases)} phase(s) of their learning plan "
        f"and is now starting Phase {next_phase.order}: {next_phase.title}.\n\n"
        f"Completed phases:\n" + "\n".join(context_lines)
    )

    # Inherit the root thread's EverMemOS group_id
    root_group_id = str(root.get("evermemos_group_id", "")) or str(uuid.uuid4())

    child = Thread(
        user_id=str(root["user_id"]),
        title=f"Phase {next_phase.order}: {next_phase.title}",
        topic_slug=topic_slug,
        phase="teaching",
        depth=1,
        parent_thread_id=root_id,
        root_thread_id=root_id,
        evermemos_group_id=root_group_id,
        parent_summary=phase_context,
    )
    _ = mongo.threads().insert_one(child.to_doc())

    # Mark old thread as explored
    _ = mongo.threads().update_one(
        {"_id": thread_id},
        {"$set": {"status": "explored", "closed_at": utcnow()}},
    )

    return {
        "thread_id": child.id,
        "title": child.title,
        "phase": "teaching",
        "phase_number": next_phase.order,
        "phase_title": next_phase.title,
        "phase_context": phase_context,
    }


@router.get("/threads/{thread_id}/branches")
def list_branches(thread_id: str):
    bps = list(mongo.branch_points().find({"thread_id": thread_id}))
    if not bps:
        return {"branches": list[object]()}

    child_ids = [bp["child_thread_id"] for bp in bps]
    children = {
        doc["_id"]: doc for doc in mongo.threads().find({"_id": {"$in": child_ids}})
    }

    branches: list[dict[str, object]] = []
    for bp in bps:
        child = children.get(bp["child_thread_id"], {})
        branches.append(
            {
                "branch_point_id": bp["_id"],
                "thread_id": bp["child_thread_id"],
                "message_id": bp["message_id"],
                "position": bp.get("position"),
                "type": bp["type"],
                "title": child.get("title", ""),
                "status": child.get("status", ""),
                "phase": child.get("phase", ""),
                "depth": child.get("depth", 0),
            }
        )

    return {"branches": branches}


@router.get("/threads/{thread_id}/tree")
def get_branch_tree(thread_id: str):
    from app.api.tree_helpers import load_thread_tree

    root_id, thread_map, by_parent = load_thread_tree(thread_id)
    if not root_id:
        return {"error": "Thread not found"}

    def build_node(tid: str) -> dict[str, object]:
        t = thread_map.get(tid, {})
        return {
            "thread_id": tid,
            "title": t.get("title", ""),
            "status": t.get("status", ""),
            "phase": t.get("phase", ""),
            "depth": t.get("depth", 0),
            "children": [build_node(cid) for cid in by_parent.get(tid, [])],
        }

    return {"tree": build_node(root_id)}


# ── Main Chat Endpoint (Agents SDK) ──────────────────────────────────────


@router.post("/chat/{thread_id}")
async def chat(thread_id: str, req: ChatRequest):
    """SSE streaming chat powered by OpenAI Agents SDK Runner."""

    async def stream():
        from app.memory import evermemos

        t_total = time.perf_counter()

        logger.info(
            "[chat] ── REQUEST ── thread=%s content=%r",
            thread_id,
            req.content[:200],
        )

        def _ms(start: float) -> int:
            return int((time.perf_counter() - start) * 1000)

        def _status(step: str, message: str, duration_ms: int) -> str:
            logger.info("[chat] %s — %dms", step, duration_ms)
            return sse(
                {
                    "type": "status",
                    "step": step,
                    "message": message,
                    "duration_ms": duration_ms,
                }
            )

        # 1. Load thread
        t0 = time.perf_counter()
        thread = mongo.threads().find_one({"_id": thread_id})
        if not thread:
            logger.warning("[chat] thread not found: %s", thread_id)
            yield sse({"type": "error", "content": "Thread not found"})
            return

        phase = str(thread.get("phase", "interview"))
        topic_slug = str(thread.get("topic_slug", ""))
        user_id = str(thread["user_id"])
        group_id = str(thread.get("evermemos_group_id", thread_id))
        logger.info(
            "[chat] thread loaded: phase=%s topic=%s user=%s group=%s",
            phase,
            topic_slug or "(none)",
            user_id,
            group_id,
        )
        yield _status("load_thread", "Loading conversation...", _ms(t0))

        # 2. Build context
        t0 = time.perf_counter()
        plan_context, current_concept = get_plan_context(topic_slug)
        interview_ctx: dict[str, object] = thread.get("interview_context", {})
        logger.info(
            "[chat] context: plan=%s current_concept=%s interview_keys=%s",
            "loaded" if plan_context else "none",
            current_concept or "(none)",
            list(interview_ctx.keys()) if interview_ctx else "[]",
        )
        yield _status("build_context", "Recalling your learning journey...", _ms(t0))

        # 3. Load history BEFORE saving user message to avoid duplication
        t0 = time.perf_counter()
        parent_context = load_parent_context(thread)
        history = load_history(thread_id)
        input_messages: list[EasyInputMessageParam] = parent_context + history + [
            {"role": "user", "content": req.content}
        ]
        logger.info(
            "[chat] history: %d parent_ctx + %d messages loaded",
            len(parent_context), len(history),
        )
        yield _status("load_history", "Loading history...", _ms(t0))

        # 4. Save user message
        t0 = time.perf_counter()
        msg_group_id = new_object_id()
        user_msg_id = save_message(
            user_id=user_id,
            thread_id=thread_id,
            role="user",
            content=req.content,
            msg_type="text",
            group_id=msg_group_id,
            index=0,
        )
        yield _status("save_message", "Saving your message...", _ms(t0))
        yield sse({"type": "message_id", "role": "user", "message_id": user_msg_id})

        # 5. Store user message in EverMemOS for memory extraction
        t0 = time.perf_counter()
        try:
            _ = await evermemos.store_memory(
                message_id=msg_group_id,
                content=req.content,
                sender=user_id,
                group_id=group_id,
                role="user",
                sender_name="Learner",
            )
        except Exception as e:
            logger.warning("[chat] evermemos store failed: %s", e)
        yield _status("store_memory", "Storing in memory...", _ms(t0))

        # 6. Build Agent for this phase
        t0 = time.perf_counter()
        agent = build_agent(
            phase=phase,
            plan_context=plan_context,
            current_concept=current_concept,
            memory_context=json.dumps(interview_ctx) if interview_ctx else None,
            parent_summary=thread.get("parent_summary"),
            branch_text=thread.get("branch_text"),
        )

        agent_ctx = AgentContext(
            user_id=user_id,
            thread_id=thread_id,
            topic_slug=topic_slug,
            group_id=group_id,
        )
        logger.info(
            "[chat] agent built: phase=%s tools=%s",
            phase,
            [t.name for t in agent.tools],
        )
        yield _status("build_agent", "Preparing your tutor...", _ms(t0))

        yield sse(
            {
                "type": "status",
                "step": "thinking",
                "message": "Thinking...",
                "duration_ms": 0,
            }
        )

        # 7. Run the agent with streaming
        t_agent = time.perf_counter()
        full_text = ""
        tool_names_called: list[str] = []
        pending_tool_names: list[str] = []
        new_topic_slug = ""
        is_first_message = len(history) == 0 and not thread.get("parent_thread_id")
        new_title = ""

        result = Runner.run_streamed(
            agent,
            input=input_messages,  # pyright: ignore[reportArgumentType]
            context=agent_ctx,
        )

        try:
            async for event in result.stream_events():
                if event.type == "raw_response_event":
                    if hasattr(event.data, "delta") and isinstance(
                        event.data, ResponseTextDeltaEvent
                    ):
                        full_text += event.data.delta
                        yield sse({"type": "stream", "content": event.data.delta})

                elif event.type == "run_item_stream_event":
                    item = event.item
                    if item.type == "tool_call_item":
                        tool_name = (
                            getattr(item.raw_item, "name", "")
                            if hasattr(item, "raw_item")
                            else ""
                        )
                        if tool_name:
                            tool_names_called.append(tool_name)
                            pending_tool_names.append(tool_name)
                            logger.info("[chat] tool_call: %s", tool_name)
                            yield sse({"type": "tool_call", "name": tool_name})

                    elif item.type == "tool_call_output_item":
                        output = str(item.output) if hasattr(item, "output") else ""
                        result_tool_name = pending_tool_names.pop(0) if pending_tool_names else ""
                        logger.info(
                            "[chat] tool_result: %s → %s",
                            result_tool_name,
                            output[:200],
                        )
                        yield sse(
                            {
                                "type": "tool_result",
                                "name": result_tool_name,
                                "result": output[:500],
                            }
                        )

                        # Detect if create_plan was called and extract topic_slug
                        if "topic_slug" in output:
                            try:
                                parsed: dict[str, object] = json.loads(output)
                                if "topic_slug" in parsed:
                                    new_topic_slug = str(parsed["topic_slug"])
                            except (json.JSONDecodeError, KeyError):
                                pass

                        # Auto-trigger Feynman after concept completion
                        if result_tool_name == "update_plan_progress" and "updated" in output:
                            try:
                                parsed_result: dict[str, object] = json.loads(output)
                                if parsed_result.get("updated"):
                                    concept = str(parsed_result.get("concept", ""))
                                    if concept:
                                        # Override any agent-initiated feynman trigger
                                        agent_ctx.feynman_concept = concept
                                        # Store phase completion info for later SSE emission
                                        agent_ctx.phase_completed = parsed_result.get("is_last_in_phase", False)
                                        agent_ctx.phase_is_final = parsed_result.get("is_last_phase", False)
                                        agent_ctx.next_phase_title = str(parsed_result.get("next_phase_title", ""))
                                        agent_ctx.completed_phase_title = str(parsed_result.get("phase_title", ""))
                            except (json.JSONDecodeError, KeyError):
                                pass

                    elif item.type == "message_output_item":
                        text = ItemHelpers.text_message_output(item)
                        if text and not full_text:
                            full_text = text
        except Exception as e:
            logger.error("[chat] agent streaming error: %s", e)
            yield sse({"type": "error", "content": "The AI provider returned an error. Please try again."})

        logger.info(
            "[chat] agent_run — %dms | tools_called=%s response_len=%d",
            _ms(t_agent),
            tool_names_called or "none",
            len(full_text),
        )

        # 8. Get final output if streaming didn't capture it
        if not full_text and result.final_output:
            full_text = str(result.final_output)
            yield sse({"type": "stream", "content": full_text})

        # 9. Save assistant response
        t0 = time.perf_counter()
        if full_text:
            assistant_msg_id = save_message(
                user_id=user_id,
                thread_id=thread_id,
                role="assistant",
                content=full_text,
                msg_type="markdown",
                group_id=msg_group_id,
                index=1,
            )
            yield sse(
                {
                    "type": "message_id",
                    "role": "assistant",
                    "message_id": assistant_msg_id,
                }
            )

            # Store assistant response in EverMemOS
            try:
                _ = await evermemos.store_memory(
                    message_id=new_object_id(),
                    content=full_text,
                    sender="feynman_bot",
                    group_id=group_id,
                    role="assistant",
                    sender_name="Feynman",
                )
            except Exception as e:
                logger.warning("[chat] evermemos store assistant failed: %s", e)
        yield _status("save_response", "Saving to memory...", _ms(t0))

        # 9c. Fire concept extractor if teaching tools were called
        EXTRACTOR_TRIGGERS = {"update_plan_progress", "trigger_feynman", "suggest_branches"}
        if phase == "teaching" and EXTRACTOR_TRIGGERS & set(tool_names_called):
            import asyncio

            async def _fire_extractor():
                try:
                    await extract_and_update_graph(thread_id, user_id, topic_slug)
                except Exception as e:
                    logger.warning("[chat] extractor failed: %s", e)

            asyncio.ensure_future(_fire_extractor())
            logger.info("[chat] concept extractor fired for thread=%s", thread_id)

        # 9d. Fire memory graph extraction
        if phase == "teaching" and EXTRACTOR_TRIGGERS & set(tool_names_called):
            async def _fire_memory_graph():
                try:
                    await extract_memory_graph(user_id)
                except Exception as e:
                    logger.warning("[chat] memory graph extraction failed: %s", e)

            asyncio.ensure_future(_fire_memory_graph())
            logger.info("[chat] memory graph extractor fired for user=%s", user_id)

        # 9b. Generate title on first message (root threads only)
        if is_first_message and full_text:
            t0 = time.perf_counter()
            new_title = await generate_thread_title(req.content, full_text)
            logger.info("[chat] title generated: %r — %dms", new_title, _ms(t0))

        # 10. Emit interview questions if present_interview was called
        if agent_ctx.interview_questions:
            yield sse(
                {
                    "type": "interview_questions",
                    "questions": agent_ctx.interview_questions,
                }
            )
            save_message(
                user_id=user_id,
                thread_id=thread_id,
                role="system",
                content=json.dumps(agent_ctx.interview_questions),
                msg_type="interview_questions",
                group_id=msg_group_id,
                index=3,
            )

        # Feynman mode trigger — no message persistence; modal is ephemeral
        # until user submits via /api/feynman/submit, which saves the TestResult.
        if agent_ctx.feynman_concept:
            yield sse({
                "type": "feynman_prompt",
                "concept_name": agent_ctx.feynman_concept,
            })

        # Phase completion — tell frontend to show "Continue to Next Phase" after Feynman test
        if agent_ctx.phase_completed:
            yield sse({
                "type": "phase_complete",
                "phase_title": agent_ctx.completed_phase_title,
                "is_final_phase": agent_ctx.phase_is_final,
                "next_phase_title": agent_ctx.next_phase_title,
            })

        # Branch suggestion — show a clickable card to branch into an off-topic
        if agent_ctx.branch_suggestion:
            yield sse({
                "type": "branch_suggestion",
                "topic": agent_ctx.branch_suggestion["topic"],
                "reason": agent_ctx.branch_suggestion["reason"],
            })

        # 11. Update topic_slug if create_plan was called
        if new_topic_slug:
            _ = mongo.threads().update_one(
                {"_id": thread_id},
                {"$set": {"topic_slug": new_topic_slug}},
            )

            try:
                save_message(
                    user_id=user_id,
                    thread_id=thread_id,
                    role="system",
                    content=json.dumps({"topic_slug": new_topic_slug}),
                    msg_type="plan_card",
                    group_id=msg_group_id,
                    index=2,
                )
            except Exception:
                pass

            yield sse({"type": "plan_created", "topic_slug": new_topic_slug})

            # Update title to plan topic name
            if not thread.get("parent_thread_id"):
                plan_path = PLANS_DIR / new_topic_slug / "plan.md"
                if plan_path.exists():
                    tree = parse_plan(plan_path.read_text())
                    if tree.topic:
                        new_title = tree.topic
                        logger.info("[chat] title from plan: %r", new_title)

        # 12. Check for phase transitions
        for tool_name in tool_names_called:
            new_phase = should_transition(current_phase=phase, tool_called=tool_name)
            if new_phase:
                apply_transition(
                    db_threads=mongo.threads(),
                    thread_id=thread_id,
                    new_phase=new_phase,
                    interview_context=interview_ctx
                    if new_phase == "planning"
                    else None,
                )
                logger.info("[chat] phase transition: %s → %s", phase, new_phase)
                yield sse({"type": "phase_change", "from": phase, "to": new_phase})
                phase = new_phase
                break

        # Check plan approval (planning -> teaching)
        if phase == "planning":
            approval_words = [
                "approve",
                "looks good",
                "let's go",
                "start",
                "yes",
                "lgtm",
                "go ahead",
            ]
            if any(w in req.content.lower() for w in approval_words):
                apply_transition(
                    db_threads=mongo.threads(),
                    thread_id=thread_id,
                    new_phase="teaching",
                )
                yield sse(
                    {"type": "phase_change", "from": "planning", "to": "teaching"}
                )

        # Emit title update if generated
        if new_title:
            yield sse({"type": "title_update", "title": new_title})

        # 13. Update thread timestamp + token usage
        run_input_tokens = sum(r.usage.input_tokens for r in result.raw_responses)
        run_output_tokens = sum(r.usage.output_tokens for r in result.raw_responses)
        run_total_tokens = sum(r.usage.total_tokens for r in result.raw_responses)
        update_set: dict[str, object] = {"updated_at": utcnow()}
        if new_title:
            update_set["title"] = new_title
        _ = mongo.threads().update_one(
            {"_id": thread_id},
            {
                "$set": update_set,
                "$inc": {
                    "token_usage.input_tokens": run_input_tokens,
                    "token_usage.output_tokens": run_output_tokens,
                    "token_usage.total_tokens": run_total_tokens,
                },
            },
        )
        total_ms = _ms(t_total)
        logger.info(
            "[chat] ── DONE ── %dms thread=%s phase=%s tools=%s",
            total_ms,
            thread_id,
            phase,
            tool_names_called or "none",
        )
        yield sse({"type": "end", "duration_ms": total_ms})

    return StreamingResponse(stream(), media_type="text/event-stream")
