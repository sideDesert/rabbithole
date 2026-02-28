"""Core agent loop — streaming LLM with tool-calling rounds.

The loop:
1. Build messages array (system prompt + history + new user message)
2. Stream LLM response via OpenAI SDK
3. If tool calls detected: execute tools, append results, loop back to LLM
4. If text response: stream chunks to WebSocket, persist, done
"""

from __future__ import annotations

import json
from typing import Any, cast

from fastapi import WebSocket
from openai import OpenAI
from pymongo.database import Database

from app.config import DEFAULT_MODEL, MAX_TOOL_ROUNDS
from app.db import mongo
from app.models.message import Message
from app.models.base import new_object_id, utcnow
from app.tools.registry import tool_registry, ToolContext
from app.agent.prompts import build_system_prompt


async def send_ws(ws: WebSocket, msg_type: str, **kwargs):
    """Send a typed JSON message over the WebSocket."""
    await ws.send_json({"type": msg_type, **kwargs})


def _load_history(thread_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Load recent messages from MongoDB and convert to OpenAI message format."""
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
            # Reconstruct as assistant message with tool_calls
            messages.append({
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
            })
        elif msg_type == "tool_result":
            messages.append({
                "role": "tool",
                "tool_call_id": content.get("tool_call_id", ""),
                "content": json.dumps(content.get("result", {})),
            })
        else:
            messages.append({"role": role, "content": content if isinstance(content, str) else json.dumps(content)})

    return messages


def _read_plan_file(topic_slug: str | None) -> str | None:
    """Read the learning plan markdown from filesystem."""
    if not topic_slug:
        return None
    from app.config import PLANS_DIR
    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if plan_path.exists():
        return plan_path.read_text()
    return None


def _persist_message(
    *,
    user_id: str,
    thread_id: str,
    role: str,
    content: str | dict[str, Any],
    msg_type: str,
    group_id: str,
    index: int,
    status: str = "complete",
) -> str:
    """Save a message to MongoDB. Returns the message _id."""
    msg = Message(
        user_id=user_id,
        thread_id=thread_id,
        role=cast(Any, role),
        content=content,
        type=cast(Any, msg_type),
        status=cast(Any, status),
        group_id=group_id,
        index=index,
    )
    mongo.messages().insert_one(msg.to_doc())
    return msg.id


async def run_agent_loop(
    *,
    ws: WebSocket,
    user_message: str,
    thread_id: str,
    user_id: str,
    agent_name: str = "feynman",
    llm_client: OpenAI,
    db: Database,
) -> None:
    """Run the agent loop for a single user message.

    Streams LLM response chunks to the WebSocket.
    Handles tool calls with up to MAX_TOOL_ROUNDS iterations.
    Persists all messages to MongoDB.
    """
    # Load thread
    thread = mongo.threads().find_one({"_id": thread_id})
    if thread is None:
        await send_ws(ws, "error", content="Thread not found")
        return

    topic_slug = thread.get("topic_slug")
    plan_content = _read_plan_file(topic_slug)

    # Build system prompt
    system_prompt = build_system_prompt(
        agent_name=agent_name,
        thread_title=thread.get("title"),
        plan_content=plan_content,
    )

    # Load conversation history
    history = _load_history(thread_id)

    # Create group_id for this exchange
    group_id = new_object_id()
    msg_index = 0

    # Persist user message
    _persist_message(
        user_id=user_id,
        thread_id=thread_id,
        role="user",
        content=user_message,
        msg_type="text",
        group_id=group_id,
        index=msg_index,
    )
    msg_index += 1

    # Build OpenAI messages array
    oai_messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": user_message},
    ]

    # Get tools for this agent
    tools = tool_registry.get_openai_tools(agent_name)
    tool_ctx = ToolContext(
        user_id=user_id,
        thread_id=thread_id,
        db=db,
        llm_client=llm_client,
        topic_slug=topic_slug,
    )

    # Tool-calling loop
    for _round in range(MAX_TOOL_ROUNDS):
        # Stream LLM response
        create_kwargs: dict[str, Any] = {
            "model": DEFAULT_MODEL,
            "messages": oai_messages,
            "stream": True,
        }
        if tools:
            create_kwargs["tools"] = tools
        stream = llm_client.chat.completions.create(**create_kwargs)  # type: ignore[call-overload]

        # Accumulate response
        full_content = ""
        tool_calls_acc: dict[int, dict] = {}  # index -> {id, name, arguments}
        finish_reason = None

        for chunk in stream:
            choice = chunk.choices[0] if chunk.choices else None
            if choice is None:
                continue

            delta = choice.delta
            finish_reason = choice.finish_reason

            # Stream text content
            if delta.content:
                full_content += delta.content
                await send_ws(ws, "stream", content=delta.content)

            # Accumulate tool calls
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {
                            "id": tc.id or "",
                            "name": tc.function.name if tc.function and tc.function.name else "",
                            "arguments": "",
                        }
                    if tc.id:
                        tool_calls_acc[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_acc[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_acc[idx]["arguments"] += tc.function.arguments

        # If we got tool calls, execute them
        if finish_reason == "tool_calls" and tool_calls_acc:
            # Build the assistant message with tool_calls for OpenAI history
            assistant_tool_calls = []
            for idx in sorted(tool_calls_acc.keys()):
                tc = tool_calls_acc[idx]
                assistant_tool_calls.append({
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": tc["arguments"],
                    },
                })

            oai_messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": assistant_tool_calls,
            })

            # Execute each tool call
            for idx in sorted(tool_calls_acc.keys()):
                tc = tool_calls_acc[idx]
                tool_name = tc["name"]
                tool_args_str = tc["arguments"]
                tool_call_id = tc["id"]

                # Send tool_call event to client
                try:
                    parsed_args = json.loads(tool_args_str) if tool_args_str else {}
                except json.JSONDecodeError:
                    parsed_args = {}

                await send_ws(ws, "tool_call", name=tool_name, args=parsed_args)

                # Persist tool_call message
                _persist_message(
                    user_id=user_id,
                    thread_id=thread_id,
                    role="assistant",
                    content={"name": tool_name, "args": parsed_args, "tool_call_id": tool_call_id},
                    msg_type="tool_call",
                    group_id=group_id,
                    index=msg_index,
                )
                msg_index += 1

                # Execute
                await send_ws(ws, "tool_status", name=tool_name, status="running")
                result = await tool_registry.execute(tool_name, tool_args_str, tool_ctx)

                # Send tool_result event to client
                await send_ws(ws, "tool_result", name=tool_name, result=result)

                # Persist tool_result message
                _persist_message(
                    user_id=user_id,
                    thread_id=thread_id,
                    role="system",
                    content={"name": tool_name, "result": result, "tool_call_id": tool_call_id},
                    msg_type="tool_result",
                    group_id=group_id,
                    index=msg_index,
                )
                msg_index += 1

                # Append tool result to OpenAI messages for next round
                oai_messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": json.dumps(result),
                })

                # Handle thread changes
                if tool_name == "explore_concept" and "thread_id" in (result or {}):
                    await send_ws(
                        ws, "thread_change",
                        thread_id=result["thread_id"],
                        title=result.get("title", ""),
                        action="explore",
                    )
                elif tool_name == "return_to_parent" and "thread_id" in (result or {}):
                    await send_ws(
                        ws, "thread_change",
                        thread_id=result["thread_id"],
                        title=result.get("title", ""),
                        action="return",
                    )

            # Continue the loop — LLM will generate a follow-up response
            continue

        # No tool calls — we have the final text response
        if full_content:
            _persist_message(
                user_id=user_id,
                thread_id=thread_id,
                role="assistant",
                content=full_content,
                msg_type="markdown",
                group_id=group_id,
                index=msg_index,
            )

        break

    # Update thread timestamp
    mongo.threads().update_one(
        {"_id": thread_id}, {"$set": {"updated_at": utcnow()}}
    )

    await send_ws(ws, "end")
