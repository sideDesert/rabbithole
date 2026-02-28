"""Thread navigation tools — explore_concept and return_to_parent."""

import uuid

from app.db import mongo
from app.models.thread import Thread
from app.models.branch_point import BranchPoint
from app.tools.registry import tool_registry, ToolContext


@tool_registry.register(
    agents=["feynman"],
    description="Branch into a sub-concept for deeper learning. Creates a child thread.",
    parameters={
        "type": "object",
        "properties": {
            "sub_topic": {
                "type": "string",
                "description": "The sub-concept to explore in a new branch",
            },
            "topic_slug": {
                "type": "string",
                "description": "URL-safe slug for the sub-topic, e.g. 'borrow-checker'",
            },
        },
        "required": ["sub_topic", "topic_slug"],
    },
)
async def explore_concept(sub_topic: str, topic_slug: str, *, ctx: ToolContext) -> dict:
    # Load parent thread
    parent = mongo.threads().find_one({"_id": ctx.thread_id})
    if parent is None:
        return {"error": f"Thread {ctx.thread_id} not found"}

    # Build child thread
    parent_slug = parent.get("topic_slug", "")
    child_slug = f"{parent_slug}/{topic_slug}" if parent_slug else topic_slug

    child = Thread(
        user_id=ctx.user_id,
        title=sub_topic,
        topic_slug=child_slug,
        depth=parent.get("depth", 0) + 1,
        parent_thread_id=ctx.thread_id,
        root_thread_id=parent.get("root_thread_id", ctx.thread_id),
        agent="feynman",
        evermemos_group_id=str(uuid.uuid4()),
    )

    # Get the last message in the parent thread for the branch point
    last_msg = mongo.messages().find_one(
        {"thread_id": ctx.thread_id},
        sort=[("created_at", -1)],
    )

    bp = BranchPoint(
        thread_id=ctx.thread_id,
        message_id=last_msg["_id"] if last_msg else "",
        type="explore",
        child_thread_id=child.id,
    )

    # Persist
    mongo.threads().insert_one(child.to_doc())
    mongo.branch_points().insert_one(bp.to_doc())

    # Update child with branch_point_id
    mongo.threads().update_one(
        {"_id": child.id}, {"$set": {"branch_point_id": bp.id}}
    )

    return {
        "thread_id": child.id,
        "title": sub_topic,
        "topic_slug": child_slug,
        "depth": child.depth,
        "action": "explore",
    }


@tool_registry.register(
    agents=["feynman"],
    description="Close the current branch and return to the parent thread.",
    parameters={
        "type": "object",
        "properties": {},
    },
)
async def return_to_parent(*, ctx: ToolContext) -> dict:
    thread = mongo.threads().find_one({"_id": ctx.thread_id})
    if thread is None:
        return {"error": f"Thread {ctx.thread_id} not found"}

    parent_id = thread.get("parent_thread_id")
    if parent_id is None:
        return {"error": "Already at root thread — nowhere to return to"}

    # Close current thread
    from app.models.base import utcnow

    mongo.threads().update_one(
        {"_id": ctx.thread_id},
        {"$set": {"status": "explored", "closed_at": utcnow()}},
    )

    parent = mongo.threads().find_one({"_id": parent_id})

    return {
        "thread_id": parent_id,
        "title": parent.get("title", "") if parent else "",
        "action": "return",
    }
