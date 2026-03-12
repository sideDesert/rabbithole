"""SSE streaming chat endpoint powered by OpenAI Agents SDK.

Flow:
1. User sends message via POST
2. We load thread, build a phase-specific Agent
3. Runner.run_streamed() handles the LLM + tool-calling loop
4. Stream events are forwarded as SSE to the client
5. Final response and phase transitions are persisted
"""

import json
import uuid

from typing import Literal

from agents import Runner, ItemHelpers
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from openai.types.responses import ResponseTextDeltaEvent
from pydantic import BaseModel

from app.agent.phases import apply_transition, should_transition
from app.agent_core import build_agent
from app.config import (
    DEFAULT_MODEL,
    LLM_API_KEY,
    LLM_BASE_URL,
    PLANS_DIR,
)
from app.db import mongo
from app.models.base import new_object_id, utcnow
from app.models.branch_point import BranchPoint, TextPosition
from app.models.message import Message
from app.models.thread import Thread
from app.plan_parser import parse_plan
from app.tools_impl import AgentContext

router = APIRouter(prefix="/api", tags=["chat"])

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


def sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def load_history(thread_id: str, limit: int = 50) -> list[dict]:
    """Load recent messages from MongoDB as OpenAI message dicts."""
    docs = list(
        mongo.messages()
        .find({"thread_id": thread_id})
        .sort("created_at", 1)
        .limit(limit)
    )
    messages = []
    for doc in docs:
        role = doc["role"]
        content = doc["content"]
        msg_type = doc.get("type", "text")

        if msg_type in ("tool_call", "tool_result"):
            continue

        if isinstance(content, str):
            messages.append({"role": role, "content": content})
        else:
            messages.append({"role": role, "content": json.dumps(content)})
    return messages


def save_message(*, user_id, thread_id, role, content, msg_type, group_id, index):
    msg = Message(
        user_id=user_id,
        thread_id=thread_id,
        role=role,
        content=content,
        type=msg_type,
        group_id=group_id,
        index=index,
    )
    mongo.messages().insert_one(msg.to_doc())


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
Summarize this learning conversation into 2-3 short paragraphs.
Focus on: what topic is being studied, what has been covered so far, \
what the learner understands well, and what they were struggling with.
Keep it factual and concise — this summary will be used as context for a follow-up conversation.
"""


async def compact_parent_context(
    history: list[dict],
    branch_text: str,
    parent_title: str,
) -> str:
    lines = []
    for msg in history:
        role = msg.get("role", "")
        content = msg.get("content", "")
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
            {"role": "user", "content": f"Topic: {parent_title}\n\nConversation:\n{transcript}"},
        ],
        max_tokens=300,
    )
    return response.choices[0].message.content or "No summary available."


# ── Thread CRUD Endpoints ─────────────────────────────────────────────────


@router.post("/threads")
def create_thread(req: ChatRequest):
    user_id = "user_001"
    thread = Thread(
        user_id=user_id,
        title=req.content[:100],
        topic_slug="",
        evermemos_group_id=str(uuid.uuid4()),
        phase="interview",
    )
    thread.root_thread_id = thread.id
    mongo.threads().insert_one(thread.to_doc())
    return {"thread_id": thread.id, "phase": "interview"}


@router.get("/threads")
def list_threads():
    docs = list(
        mongo.threads().find({"user_id": "user_001"}).sort("updated_at", -1).limit(50)
    )
    for doc in docs:
        doc["id"] = doc.pop("_id", "")
    return {"threads": docs}


@router.delete("/threads/{thread_id}")
def delete_thread(thread_id: str):
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "not found"}
    mongo.messages().delete_many({"thread_id": thread_id})
    mongo.branch_points().delete_many(
        {"$or": [{"parent_thread_id": thread_id}, {"child_thread_id": thread_id}]}
    )
    mongo.threads().delete_one({"_id": thread_id})
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
    topic_slug = doc.get("topic_slug")
    if not topic_slug:
        return {"progress": 0, "phases": []}
    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"progress": 0, "phases": []}
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
    topic_slug = doc.get("topic_slug")
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
    topic_slug = doc.get("topic_slug")
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
            plan_path.write_text(content)
            break
    else:
        return {"toggled": False, "reason": "Concept not found or already in target state"}

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
        .find({"thread_id": thread_id, "type": {"$in": ["text", "markdown", "plan_card", "interview_questions"]}})
        .sort("created_at", 1)
    )
    messages = []
    for doc in docs:
        messages.append(
            {
                "id": doc.get("_id", ""),
                "role": doc["role"],
                "content": doc["content"],
                "type": doc.get("type", "text"),
            }
        )
    return {"messages": messages}


# ── Branch Endpoints ──────────────────────────────────────────────────────


@router.post("/threads/{thread_id}/branch")
async def create_branch(thread_id: str, req: BranchRequest):
    parent = mongo.threads().find_one({"_id": thread_id})
    if not parent:
        return {"error": "Thread not found"}

    msg = mongo.messages().find_one({"_id": req.message_id, "thread_id": thread_id})
    if not msg:
        return {"error": "Message not found in this thread"}

    history = load_history(thread_id, limit=20)
    summary = await compact_parent_context(
        history=history,
        branch_text=req.branch_text,
        parent_title=parent.get("title", ""),
    )

    title = req.title or req.branch_text[:80]

    child = Thread(
        user_id=parent["user_id"],
        title=title,
        topic_slug=parent.get("topic_slug", ""),
        phase="teaching",
        depth=parent.get("depth", 0) + 1,
        parent_thread_id=thread_id,
        root_thread_id=parent.get("root_thread_id", thread_id),
        evermemos_group_id=str(uuid.uuid4()),
        parent_summary=summary,
        branch_text=req.branch_text,
    )
    mongo.threads().insert_one(child.to_doc())

    position = None
    if req.position_start is not None and req.position_end is not None:
        position = TextPosition(start=req.position_start, end=req.position_end)

    bp = BranchPoint(
        thread_id=thread_id,
        message_id=req.message_id,
        position=position,
        type=req.branch_type,
        child_thread_id=child.id,
    )
    mongo.branch_points().insert_one(bp.to_doc())
    mongo.threads().update_one(
        {"_id": child.id}, {"$set": {"branch_point_id": bp.id}}
    )

    return {
        "thread_id": child.id,
        "branch_point_id": bp.id,
        "title": title,
        "phase": "teaching",
        "parent_summary": summary,
    }


@router.get("/threads/{thread_id}/branches")
def list_branches(thread_id: str):
    bps = list(mongo.branch_points().find({"thread_id": thread_id}))
    if not bps:
        return {"branches": []}

    child_ids = [bp["child_thread_id"] for bp in bps]
    children = {
        doc["_id"]: doc
        for doc in mongo.threads().find({"_id": {"$in": child_ids}})
    }

    branches = []
    for bp in bps:
        child = children.get(bp["child_thread_id"], {})
        branches.append({
            "branch_point_id": bp["_id"],
            "thread_id": bp["child_thread_id"],
            "message_id": bp["message_id"],
            "position": bp.get("position"),
            "type": bp["type"],
            "title": child.get("title", ""),
            "status": child.get("status", ""),
            "phase": child.get("phase", ""),
            "depth": child.get("depth", 0),
        })

    return {"branches": branches}


@router.get("/threads/{thread_id}/tree")
def get_branch_tree(thread_id: str):
    thread = mongo.threads().find_one({"_id": thread_id})
    if not thread:
        return {"error": "Thread not found"}

    root_id = thread.get("root_thread_id", thread_id)
    all_threads = list(mongo.threads().find({"root_thread_id": root_id}))
    if not any(t["_id"] == root_id for t in all_threads):
        root_doc = mongo.threads().find_one({"_id": root_id})
        if root_doc:
            all_threads.append(root_doc)

    by_parent: dict[str, list[str]] = {}
    thread_map: dict[str, dict] = {}
    for t in all_threads:
        tid = t["_id"]
        thread_map[tid] = t
        pid = t.get("parent_thread_id")
        if pid:
            by_parent.setdefault(pid, []).append(tid)

    def build_node(tid: str) -> dict:
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
        # 1. Load thread
        thread = mongo.threads().find_one({"_id": thread_id})
        if not thread:
            yield sse({"type": "error", "content": "Thread not found"})
            return

        phase = thread.get("phase", "interview")
        topic_slug = thread.get("topic_slug", "")
        user_id = thread["user_id"]
        group_id = thread.get("evermemos_group_id", thread_id)

        # 2. Build context
        plan_context, current_concept = get_plan_context(topic_slug)
        interview_ctx = thread.get("interview_context", {})

        # 3. Save user message
        msg_group_id = new_object_id()
        save_message(
            user_id=user_id,
            thread_id=thread_id,
            role="user",
            content=req.content,
            msg_type="text",
            group_id=msg_group_id,
            index=0,
        )

        # 4. Store user message in EverMemOS for memory extraction
        try:
            from app.memory import evermemos
            await evermemos.store_memory(
                message_id=msg_group_id,
                content=req.content,
                sender=user_id,
                group_id=group_id,
                role="user",
                sender_name="Learner",
            )
        except Exception:
            pass  # non-critical; don't block the response

        # 5. Build Agent for this phase
        agent = build_agent(
            phase=phase,
            plan_context=plan_context,
            current_concept=current_concept,
            memory_context=json.dumps(interview_ctx) if interview_ctx else None,
            parent_summary=thread.get("parent_summary"),
            branch_text=thread.get("branch_text"),
        )

        # 6. Build input messages (history + new user message)
        history = load_history(thread_id)
        input_messages = history + [{"role": "user", "content": req.content}]

        agent_ctx = AgentContext(
            user_id=user_id,
            thread_id=thread_id,
            topic_slug=topic_slug,
            group_id=group_id,
        )

        yield sse({"type": "phase", "phase": phase})

        # 7. Run the agent with streaming
        full_text = ""
        tool_names_called: list[str] = []
        new_topic_slug = ""

        result = Runner.run_streamed(
            agent,
            input=input_messages,
            context=agent_ctx,
        )

        async for event in result.stream_events():
            if event.type == "raw_response_event":
                if hasattr(event.data, "delta") and isinstance(event.data, ResponseTextDeltaEvent):
                    full_text += event.data.delta
                    yield sse({"type": "stream", "content": event.data.delta})

            elif event.type == "run_item_stream_event":
                item = event.item
                if item.type == "tool_call_item":
                    tool_name = getattr(item.raw_item, "name", "") if hasattr(item, "raw_item") else ""
                    if tool_name:
                        tool_names_called.append(tool_name)
                        yield sse({"type": "tool_call", "name": tool_name})

                elif item.type == "tool_call_output_item":
                    output = item.output if hasattr(item, "output") else ""
                    yield sse({"type": "tool_result", "result": output[:500] if isinstance(output, str) else str(output)[:500]})

                    # Detect if create_plan was called and extract topic_slug
                    if isinstance(output, str) and "topic_slug" in output:
                        try:
                            parsed = json.loads(output)
                            if "topic_slug" in parsed:
                                new_topic_slug = parsed["topic_slug"]
                        except (json.JSONDecodeError, KeyError):
                            pass

                elif item.type == "message_output_item":
                    text = ItemHelpers.text_message_output(item)
                    if text and not full_text:
                        full_text = text

        # 8. Get final output if streaming didn't capture it
        if not full_text and result.final_output:
            full_text = str(result.final_output)
            yield sse({"type": "stream", "content": full_text})

        # 9. Save assistant response
        if full_text:
            save_message(
                user_id=user_id,
                thread_id=thread_id,
                role="assistant",
                content=full_text,
                msg_type="markdown",
                group_id=msg_group_id,
                index=1,
            )

            # Store assistant response in EverMemOS
            try:
                await evermemos.store_memory(
                    message_id=new_object_id(),
                    content=full_text,
                    sender="feynman_bot",
                    group_id=group_id,
                    role="assistant",
                    sender_name="Feynman",
                )
            except Exception:
                pass

        # 10. Emit interview questions if present_interview was called
        if agent_ctx.interview_questions:
            yield sse({
                "type": "interview_questions",
                "questions": agent_ctx.interview_questions,
            })
            save_message(
                user_id=user_id,
                thread_id=thread_id,
                role="system",
                content=json.dumps(agent_ctx.interview_questions),
                msg_type="interview_questions",
                group_id=msg_group_id,
                index=3,
            )

        # 11. Update topic_slug if create_plan was called
        if new_topic_slug:
            mongo.threads().update_one(
                {"_id": thread_id},
                {"$set": {"topic_slug": new_topic_slug}},
            )
            topic_slug = new_topic_slug

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

        # 12. Check for phase transitions
        for tool_name in tool_names_called:
            new_phase = should_transition(current_phase=phase, tool_called=tool_name)
            if new_phase:
                apply_transition(
                    db_threads=mongo.threads(),
                    thread_id=thread_id,
                    new_phase=new_phase,
                    interview_context=interview_ctx if new_phase == "planning" else None,
                )
                yield sse({"type": "phase_change", "from": phase, "to": new_phase})
                phase = new_phase
                break

        # Check plan approval (planning -> teaching)
        if phase == "planning":
            approval_words = ["approve", "looks good", "let's go", "start", "yes", "lgtm", "go ahead"]
            if any(w in req.content.lower() for w in approval_words):
                apply_transition(
                    db_threads=mongo.threads(),
                    thread_id=thread_id,
                    new_phase="teaching",
                )
                yield sse({"type": "phase_change", "from": "planning", "to": "teaching"})

        # 13. Update thread timestamp
        mongo.threads().update_one(
            {"_id": thread_id}, {"$set": {"updated_at": utcnow()}}
        )
        yield sse({"type": "end"})

    return StreamingResponse(stream(), media_type="text/event-stream")
