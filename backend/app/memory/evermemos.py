"""Async HTTP client for EverMemOS Cloud (https://api.evermind.ai)."""

from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import EVERMEMOS_API, EVERMEMOS_BASE_URL

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=EVERMEMOS_BASE_URL,
            headers={
                "Authorization": f"Bearer {EVERMEMOS_API}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )
    return _client


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def store_memory(
    *,
    message_id: str,
    content: str,
    sender: str,
    group_id: str,
    role: str = "user",
    sender_name: str = "Learner",
    flush: bool = False,
) -> dict[str, Any]:
    """Store a message to EverMemOS Cloud for memory extraction.

    Returns: {"status": "queued", "message": "...", "request_id": "..."}
    """
    payload: dict[str, Any] = {
        "message_id": message_id,
        "create_time": _now_iso(),
        "sender": sender,
        "sender_name": sender_name,
        "group_id": group_id,
        "role": role,
        "content": content,
    }
    if flush:
        payload["flush"] = True

    resp = await _get_client().post("/api/v0/memories", json=payload)
    resp.raise_for_status()
    return resp.json()


async def search_memories(
    *,
    user_id: str,
    query: str,
    retrieve_method: str = "rrf",
    top_k: int = 10,
    memory_types: list[str] | None = None,
) -> dict[str, Any]:
    """Search EverMemOS Cloud for relevant memories.

    Returns the full response with status, message, and result containing memories.
    """
    params: dict[str, Any] = {
        "user_id": user_id,
        "query": query,
        "retrieve_method": retrieve_method,
        "top_k": top_k,
    }
    if memory_types:
        params["memory_types"] = ",".join(memory_types)

    resp = await _get_client().get("/api/v0/memories/search", params=params)
    resp.raise_for_status()
    return resp.json()


async def get_memories(
    *,
    user_id: str,
    memory_type: str = "episodic_memory",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    """Fetch memories by type (profile, episodic_memory, foresight, event_log)."""
    params: dict[str, Any] = {
        "user_id": user_id,
        "memory_type": memory_type,
        "page": page,
        "page_size": page_size,
    }
    resp = await _get_client().get("/api/v0/memories", params=params)
    resp.raise_for_status()
    return resp.json()


async def set_conversation_meta(
    *,
    group_id: str,
    user_id: str,
    user_name: str = "Learner",
    scene: str = "assistant",
) -> dict[str, Any]:
    """Set conversation metadata for a thread's EverMemOS group."""
    resp = await _get_client().post(
        "/api/v0/memories/conversation-meta",
        json={
            "group_id": group_id,
            "scene": scene,
            "created_at": _now_iso(),
            "default_timezone": "UTC",
            "user_details": {
                user_id: {"full_name": user_name, "role": "user"},
                "feynman_bot": {"full_name": "Feynman", "role": "assistant"},
            },
        },
    )
    resp.raise_for_status()
    return resp.json()
