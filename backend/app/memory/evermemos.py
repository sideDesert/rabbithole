"""Async HTTP client for EverMemOS memory service."""

from typing import Any

import httpx

from app.config import EVERMEMOS_BASE_URL

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=EVERMEMOS_BASE_URL, timeout=30.0)
    return _client


async def store_memory(
    *,
    message_id: str,
    content: str,
    sender: str,
    group_id: str,
    role: str = "user",
    sender_name: str = "Learner",
) -> dict[str, Any]:
    """Store a message to EverMemOS. Returns response with status_info."""
    resp = await _get_client().post(
        "/api/v1/memories",
        json={
            "message_id": message_id,
            "content": content,
            "sender": sender,
            "group_id": group_id,
            "sender_name": sender_name,
            "role": role,
        },
    )
    resp.raise_for_status()
    return resp.json()


async def search_memories(
    *,
    user_id: str,
    query: str,
    retrieve_method: str = "rrf",
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """Search EverMemOS for relevant memories."""
    resp = await _get_client().get(
        "/api/v1/memories/search",
        params={
            "user_id": user_id,
            "query": query,
            "retrieve_method": retrieve_method,
            "top_k": top_k,
        },
    )
    resp.raise_for_status()
    return resp.json()


async def get_memories_by_type(
    *,
    user_id: str,
    memory_type: str,
    page: int = 1,
    page_size: int = 20,
) -> list[dict[str, Any]]:
    """Fetch memories by type (episode, event_log, foresight, profile)."""
    resp = await _get_client().get(
        "/api/v1/memories",
        params={
            "user_id": user_id,
            "memory_type": memory_type,
            "page": page,
            "page_size": page_size,
        },
    )
    resp.raise_for_status()
    return resp.json()


async def set_conversation_meta(
    *,
    group_id: str,
    user_id: str,
    user_name: str = "Learner",
) -> dict[str, Any]:
    """Set conversation metadata for a thread's EverMemOS group."""
    resp = await _get_client().post(
        "/api/v1/memories/conversation-meta",
        json={
            "group_id": group_id,
            "scene": "assistant",
            "user_details": {
                user_id: {"name": user_name, "role": "student"},
            },
            "default_timezone": "America/Los_Angeles",
        },
    )
    resp.raise_for_status()
    return resp.json()
