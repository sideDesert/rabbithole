"""Ebbinghaus proactive notification endpoint."""

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from agents import Runner
from fastapi import APIRouter
from pydantic import BaseModel

from app.agent.prompts import EBBINGHAUS_NOTIFICATION_ADDENDUM
from app.agent_core import build_ebbinghaus_agent
from app.config import PLANS_DIR
from app.db import mongo
from app.models.base import new_object_id, utcnow
from app.models.message import Message
from app.models.thread import Thread
from app.plan_parser import parse_plan
from app.tools_impl import AgentContext

router = APIRouter(prefix="/api/ebbinghaus", tags=["ebbinghaus"])
logger = logging.getLogger(__name__)

DEDUP_MINUTES = 30


class NotifyResponse(BaseModel):
    notified: bool
    thread_id: str | None = None


def _find_or_create_notification_thread(user_id: str) -> dict:
    """Return the notification thread doc, creating it if needed."""
    doc = mongo.threads().find_one({
        "user_id": user_id,
        "agent": "ebbinghaus",
        "is_notification_thread": True,
    })
    if doc:
        return doc

    thread = Thread(
        user_id=user_id,
        title="Notifications",
        topic_slug="__notifications__",
        phase="teaching",
        agent="ebbinghaus",
        evermemos_group_id=str(uuid.uuid4()),
        is_notification_thread=True,
    )
    thread.root_thread_id = thread.id
    doc = thread.to_doc()
    mongo.threads().insert_one(doc)
    return doc


def _get_most_overdue_review(user_id: str) -> dict | None:
    """Return the most overdue pending review, or None."""
    now = datetime.now(timezone.utc)
    doc = mongo.review_schedule().find_one(
        {
            "user_id": user_id,
            "status": {"$in": ["pending", "triggered"]},
            "scheduled_for": {"$lte": now},
        },
        sort=[("scheduled_for", 1)],
    )
    if not doc:
        return None

    mastery_doc = mongo.concept_mastery().find_one({
        "user_id": user_id,
        "concept_id": doc["concept_id"],
    })
    return {
        "type": "overdue_review",
        "concept_name": doc["concept_id"],
        "topic_slug": doc.get("topic_slug", ""),
        "scheduled_for": doc["scheduled_for"].isoformat(),
        "mastery_score": mastery_doc["score"] if mastery_doc else None,
        "mastery_tier": mastery_doc.get("tier") if mastery_doc else None,
    }


def _get_stalest_incomplete_topic(user_id: str) -> dict | None:
    """Find the Feynman topic untouched the longest (>24h) with uncompleted concepts."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    feynman_threads = list(mongo.threads().find({
        "user_id": user_id,
        "agent": "feynman",
        "topic_slug": {"$ne": ""},
    }))

    candidates = []
    seen_slugs: set[str] = set()

    for thread in feynman_threads:
        slug = thread.get("topic_slug", "")
        if not slug or slug in seen_slugs:
            continue
        seen_slugs.add(slug)

        plan_path = PLANS_DIR / slug / "plan.md"
        if not plan_path.exists():
            continue

        tree = parse_plan(plan_path.read_text())
        if tree.first_uncompleted_concept() is None:
            continue

        latest_msg = mongo.messages().find_one(
            {"thread_id": thread["_id"], "role": {"$in": ["user", "assistant"]}},
            sort=[("created_at", -1)],
        )
        if not latest_msg:
            continue

        last_active = latest_msg["created_at"]
        if last_active.tzinfo is None:
            last_active = last_active.replace(tzinfo=timezone.utc)
        if last_active > cutoff:
            continue

        next_concept = tree.first_uncompleted_concept()
        candidates.append({
            "type": "stale_topic",
            "topic_slug": slug,
            "topic_name": tree.topic,
            "last_active": last_active.isoformat(),
            "next_concept": next_concept.name if next_concept else None,
            "progress": f"{tree.overall_progress:.0%}",
        })

    if not candidates:
        return None

    candidates.sort(key=lambda c: c["last_active"])
    return candidates[0]


async def _run_ebbinghaus_notification(
    thread_doc: dict, notification_data: dict, user_id: str
) -> str:
    """Run the Ebbinghaus agent to craft a notification message."""
    thread_id = thread_doc["_id"]

    recent_msgs = list(
        mongo.messages()
        .find({"thread_id": thread_id, "type": {"$in": ["notification", "text", "markdown"]}})
        .sort("created_at", -1)
        .limit(10)
    )
    recent_msgs.reverse()

    input_messages = []
    for msg in recent_msgs:
        input_messages.append({
            "role": msg["role"],
            "content": msg["content"] if isinstance(msg["content"], str) else str(msg["content"]),
        })

    system_context = (
        f"{EBBINGHAUS_NOTIFICATION_ADDENDUM}\n\n"
        f"Notification data:\n{json.dumps(notification_data, indent=2)}"
    )
    input_messages.append({"role": "system", "content": system_context})

    agent_ctx = AgentContext(
        user_id=user_id,
        thread_id=thread_id,
        topic_slug=notification_data.get("topic_slug", ""),
        group_id=thread_doc.get("evermemos_group_id", ""),
    )

    agent = build_ebbinghaus_agent()

    result = await Runner.run(agent, input=input_messages, context=agent_ctx)
    return result.final_output or ""


@router.post("/notify", response_model=NotifyResponse)
async def notify(user_id: str = "user_001"):
    """Check for due reviews / stale topics and have Ebbinghaus send a nudge."""
    try:
        thread_doc = _find_or_create_notification_thread(user_id)
        thread_id = thread_doc["_id"]

        last_notified = thread_doc.get("last_notified_at")
        if last_notified:
            if isinstance(last_notified, str):
                last_notified = datetime.fromisoformat(last_notified)
            if last_notified.tzinfo is None:
                last_notified = last_notified.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last_notified < timedelta(minutes=DEDUP_MINUTES):
                return NotifyResponse(notified=False, thread_id=thread_id)

        item = _get_most_overdue_review(user_id)
        if not item:
            item = _get_stalest_incomplete_topic(user_id)
        if not item:
            return NotifyResponse(notified=False, thread_id=thread_id)

        response_text = await _run_ebbinghaus_notification(thread_doc, item, user_id)
        if not response_text.strip():
            return NotifyResponse(notified=False, thread_id=thread_id)

        group_id = new_object_id()
        msg = Message(
            user_id=user_id,
            thread_id=thread_id,
            role="assistant",
            content=response_text,
            type="notification",
            group_id=group_id,
            index=0,
        )
        mongo.messages().insert_one(msg.to_doc())

        mongo.threads().update_one(
            {"_id": thread_id},
            {"$set": {"last_notified_at": utcnow()}},
        )

        return NotifyResponse(notified=True, thread_id=thread_id)

    except Exception:
        logger.exception("Ebbinghaus notification failed")
        return NotifyResponse(notified=False, thread_id=None)
