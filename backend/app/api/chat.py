"""SSE streaming chat endpoint.

Simple flow:
1. User sends message via POST
2. We load the thread, build messages array with phase-aware system prompt
3. Stream LLM response as SSE events
4. Handle tool calls if the LLM wants to use tools
5. Persist everything to MongoDB
"""

import json
import uuid

from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from app.agent.phases import apply_transition, should_transition
from app.agent.prompts import build_phase_prompt
from app.agent.tool_defs import PHASE_TOOLS, execute_tool
from app.config import (
    DEFAULT_MODEL,
    MAX_TOOL_ROUNDS,
    OPENROUTER_API,
    OPENROUTER_BASE_URL,
    PLANS_DIR,
)
from app.db import mongo
from app.models.base import new_object_id, utcnow
from app.models.branch_point import BranchPoint, TextPosition
from app.models.message import Message
from app.models.thread import Thread
from app.plan_parser import parse_plan

router = APIRouter(prefix="/api", tags=["chat"])

llm = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=OPENROUTER_API)


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


# ── Helpers ───────────────────────────────────────────────────────────────


def sse(data: dict) -> str:
    """Format a dict as an SSE event."""
    return f"data: {json.dumps(data)}\n\n"


def load_history(thread_id: str, limit: int = 50) -> list[dict]:
    """Load recent messages from MongoDB as OpenAI message format."""
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

        if msg_type == "tool_call":
            messages.append(
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": content.get("tool_call_id", ""),
                            "type": "function",
                            "function": {
                                "name": content["name"],
                                "arguments": json.dumps(content.get("args", {})),
                            },
                        }
                    ],
                }
            )
        elif msg_type == "tool_result":
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": content.get("tool_call_id", ""),
                    "content": json.dumps(content.get("result", {})),
                }
            )
        else:
            messages.append(
                {
                    "role": role,
                    "content": content
                    if isinstance(content, str)
                    else json.dumps(content),
                }
            )
    return messages


def save_message(*, user_id, thread_id, role, content, msg_type, group_id, index):
    """Persist a message to MongoDB."""
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
    """Read plan markdown and find current concept."""
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


def compact_parent_context(
    history: list[dict],
    branch_text: str,
    parent_title: str,
) -> str:
    """Summarize parent thread history into a compact context string."""
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
    response = llm.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": COMPACTION_PROMPT},
            {"role": "user", "content": f"Topic: {parent_title}\n\nConversation:\n{transcript}"},
        ],
        max_tokens=300,
    )
    return response.choices[0].message.content or "No summary available."


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.post("/threads")
def create_thread(req: ChatRequest):
    """Create a new thread. Starts in interview phase."""
    user_id = "user_001"  # TODO: auth
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
    """List all threads."""
    docs = list(
        mongo.threads().find({"user_id": "user_001"}).sort("updated_at", -1).limit(50)
    )
    # Convert ObjectId-style _id to string for JSON
    for doc in docs:
        doc["id"] = doc.pop("_id", "")
    return {"threads": docs}


@router.delete("/threads/{thread_id}")
def delete_thread(thread_id: str):
    """Delete a thread and its messages."""
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "not found"}
    mongo.messages().delete_many({"thread_id": thread_id})
    mongo.branch_points().delete_many({"$or": [{"parent_thread_id": thread_id}, {"child_thread_id": thread_id}]})
    mongo.threads().delete_one({"_id": thread_id})
    return {"deleted": True}


@router.get("/threads/{thread_id}")
def get_thread(thread_id: str):
    """Get thread details."""
    doc = mongo.threads().find_one({"_id": thread_id})
    if not doc:
        return {"error": "not found"}
    doc["id"] = doc.pop("_id", "")
    return doc


@router.get("/threads/{thread_id}/progress")
def get_progress(thread_id: str):
    """Get plan progress."""
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
    return {
        "topic": tree.topic,
        "overall_progress": tree.overall_progress,
        "current_concept": tree.first_uncompleted_concept().name if tree.first_uncompleted_concept() else None,
        "phases": [
            {
                "title": p.title,
                "progress": p.progress,
                "concepts": [
                    {"name": c.name, "completed": c.completed} for c in p.concepts
                ],
            }
            for p in tree.phases
        ],
    }


@router.get("/threads/{thread_id}/messages")
def get_messages(thread_id: str):
    """Get all messages for a thread."""
    docs = list(
        mongo.messages()
        .find({"thread_id": thread_id, "type": {"$in": ["text", "markdown"]}})
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


@router.post("/threads/{thread_id}/branch")
def create_branch(thread_id: str, req: BranchRequest):
    """Create a child thread branching from a specific message."""
    parent = mongo.threads().find_one({"_id": thread_id})
    if not parent:
        return {"error": "Thread not found"}

    # Verify message belongs to parent thread
    msg = mongo.messages().find_one({"_id": req.message_id, "thread_id": thread_id})
    if not msg:
        return {"error": "Message not found in this thread"}

    # Compact parent conversation into a summary
    history = load_history(thread_id, limit=20)
    summary = compact_parent_context(
        history=history,
        branch_text=req.branch_text,
        parent_title=parent.get("title", ""),
    )

    title = req.title or req.branch_text[:80]

    # Create child thread — starts in teaching phase (skips interview)
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

    # Create branch point linking parent → child
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

    # Link branch point back to child thread
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
    """List all child branches of a thread."""
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
    """Get the full branch tree from the root."""
    thread = mongo.threads().find_one({"_id": thread_id})
    if not thread:
        return {"error": "Thread not found"}

    root_id = thread.get("root_thread_id", thread_id)

    # Load all threads in this tree in one query
    all_threads = list(mongo.threads().find({"root_thread_id": root_id}))
    if not any(t["_id"] == root_id for t in all_threads):
        root_doc = mongo.threads().find_one({"_id": root_id})
        if root_doc:
            all_threads.append(root_doc)

    # Build parent → children lookup
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


@router.post("/chat/{thread_id}")
def chat(thread_id: str, req: ChatRequest):
    """SSE streaming chat. The main endpoint."""

    def stream():
        # 1. Load thread
        thread = mongo.threads().find_one({"_id": thread_id})
        if not thread:
            yield sse({"type": "error", "content": "Thread not found"})
            return

        phase = thread.get("phase", "interview")
        topic_slug = thread.get("topic_slug", "")
        user_id = thread["user_id"]

        # 2. Build context
        plan_context, current_concept = get_plan_context(topic_slug)
        interview_ctx = thread.get("interview_context", {})

        # 3. Save user message
        group_id = new_object_id()
        save_message(
            user_id=user_id,
            thread_id=thread_id,
            role="user",
            content=req.content,
            msg_type="text",
            group_id=group_id,
            index=0,
        )

        # 4. Build messages array
        system_prompt = build_phase_prompt(
            phase=phase,
            plan_context=plan_context,
            current_concept=current_concept,
            memory_context=json.dumps(interview_ctx) if interview_ctx else None,
            parent_summary=thread.get("parent_summary"),
            branch_text=thread.get("branch_text"),
        )
        history = load_history(thread_id)
        oai_messages = [
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": req.content},
        ]

        # 5. Get tools for this phase
        tools = PHASE_TOOLS.get(phase, [])
        msg_index = 1
        tool_names_called = []

        yield sse({"type": "phase", "phase": phase})

        # 6. LLM loop (with tool calling rounds)
        for _round in range(MAX_TOOL_ROUNDS):
            create_args = {
                "model": DEFAULT_MODEL,
                "messages": oai_messages,
                "stream": True,
            }
            if tools:
                create_args["tools"] = tools

            stream_resp = llm.chat.completions.create(**create_args)

            full_content = ""
            tool_calls_acc = {}
            finish_reason = None

            for chunk in stream_resp:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue
                delta = choice.delta
                finish_reason = choice.finish_reason

                # Stream text
                if delta.content:
                    full_content += delta.content
                    yield sse({"type": "stream", "content": delta.content})

                # Accumulate tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {
                                "id": "",
                                "name": "",
                                "arguments": "",
                            }
                        if tc.id:
                            tool_calls_acc[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_acc[idx]["name"] = tc.function.name
                            if tc.function.arguments:
                                tool_calls_acc[idx]["arguments"] += (
                                    tc.function.arguments
                                )

            # Handle tool calls
            if finish_reason == "tool_calls" and tool_calls_acc:
                assistant_tool_calls = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["name"], "arguments": tc["arguments"]},
                    }
                    for tc in [tool_calls_acc[i] for i in sorted(tool_calls_acc)]
                ]
                oai_messages.append(
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": assistant_tool_calls,
                    }
                )

                for tc in [tool_calls_acc[i] for i in sorted(tool_calls_acc)]:
                    name = tc["name"]
                    args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                    tool_call_id = tc["id"]
                    tool_names_called.append(name)

                    yield sse({"type": "tool_call", "name": name, "args": args})

                    # Save tool call
                    save_message(
                        user_id=user_id,
                        thread_id=thread_id,
                        role="assistant",
                        content={
                            "name": name,
                            "args": args,
                            "tool_call_id": tool_call_id,
                        },
                        msg_type="tool_call",
                        group_id=group_id,
                        index=msg_index,
                    )
                    msg_index += 1

                    # Execute tool
                    result = execute_tool(name, args, topic_slug=topic_slug)
                    yield sse({"type": "tool_result", "name": name, "result": result})

                    # Save tool result
                    save_message(
                        user_id=user_id,
                        thread_id=thread_id,
                        role="system",
                        content={
                            "name": name,
                            "result": result,
                            "tool_call_id": tool_call_id,
                        },
                        msg_type="tool_result",
                        group_id=group_id,
                        index=msg_index,
                    )
                    msg_index += 1

                    # Feed back to LLM
                    oai_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": json.dumps(result),
                        }
                    )

                    # If create_plan was called, update thread topic_slug
                    if name == "create_plan" and "plan_path" in (result or {}):
                        slug = result["plan_path"].split("/")[-2]
                        mongo.threads().update_one(
                            {"_id": thread_id},
                            {"$set": {"topic_slug": slug}},
                        )
                        topic_slug = slug

                continue  # next LLM round

            # No tool calls — save final response
            if full_content:
                save_message(
                    user_id=user_id,
                    thread_id=thread_id,
                    role="assistant",
                    content=full_content,
                    msg_type="markdown",
                    group_id=group_id,
                    index=msg_index,
                )
            break

        # 7. Check for phase transitions
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
                yield sse({"type": "phase_change", "from": phase, "to": new_phase})
                phase = new_phase
                break

        # Check plan approval (planning → teaching)
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

        # 8. Update thread timestamp
        mongo.threads().update_one(
            {"_id": thread_id}, {"$set": {"updated_at": utcnow()}}
        )
        yield sse({"type": "end"})

    return StreamingResponse(stream(), media_type="text/event-stream")
