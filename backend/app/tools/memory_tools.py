"""Memory tools — recall and store via EverMemOS."""

from app.memory import evermemos
from app.tools.registry import tool_registry, ToolContext


@tool_registry.register(
    agents=["feynman", "ebbinghaus"],
    description="Search your memory for what you know about this learner — past sessions, struggles, preferences.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What to search for, e.g. 'Rust ownership' or 'learner background'",
            },
        },
        "required": ["query"],
    },
)
async def recall_about_user(query: str, *, ctx: ToolContext) -> dict:
    try:
        results = await evermemos.search_memories(
            user_id=ctx.user_id,
            query=query,
            retrieve_method="rrf",
            top_k=10,
        )
        return {"memories": results}
    except Exception as e:
        return {"error": f"EverMemOS search failed: {e}", "memories": []}


@tool_registry.register(
    agents=["feynman", "ebbinghaus"],
    description="Remember an important fact about this learner for future sessions.",
    parameters={
        "type": "object",
        "properties": {
            "fact": {
                "type": "string",
                "description": "The fact to remember, e.g. 'Learner prefers visual analogies'",
            },
        },
        "required": ["fact"],
    },
)
async def remember(fact: str, *, ctx: ToolContext) -> dict:
    try:
        from app.models.base import new_object_id

        result = await evermemos.store_memory(
            message_id=new_object_id(),
            content=f"[Agent observation] {fact}",
            sender=ctx.user_id,
            group_id=ctx.thread_id,
            role="assistant",
            sender_name="Feynman",
        )
        return {"status": "stored", "evermemos_status": result.get("status_info", "")}
    except Exception as e:
        return {"error": f"EverMemOS store failed: {e}"}
