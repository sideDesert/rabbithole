# Ebbinghaus Proactive Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ebbinghaus proactively nudges the user about overdue reviews and stale incomplete topics, with an unread badge in the sidebar.

**Architecture:** New `POST /api/ebbinghaus/notify` endpoint handles notification selection (most overdue review or stalest incomplete Feynman topic >24h), runs the Ebbinghaus agent to craft a nudge, and persists it to a dedicated notifications thread. Frontend hook polls the endpoint and tracks unread count via localStorage.

**Tech Stack:** FastAPI, OpenAI Agents SDK (`Runner.run`), MongoDB, React (useState + useQuery), localStorage

**Spec:** `docs/superpowers/specs/2026-03-19-ebbinghaus-notifications-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/app/models/thread.py` | Add `is_notification_thread` and `last_notified_at` fields |
| Modify | `backend/app/models/message.py` | Add `"notification"` to `type` literal |
| Modify | `backend/app/api/chat.py` | Add `save_message` support for `"notification"` type |
| Create | `backend/app/api/notify.py` | New router with `POST /api/ebbinghaus/notify` |
| Modify | `backend/app/agent/prompts.py` | Add `EBBINGHAUS_NOTIFICATION_ADDENDUM` |
| Modify | `backend/main.py` | Register notify router |
| Create | `client/hooks/use-ebbinghaus-notifications.ts` | Frontend hook: poll notify endpoint, track unread count |
| Create | `client/lib/api-notify.ts` | `triggerNotify()` and `getNotificationMessages()` API functions |
| Modify | `client/components/app-sidebar.tsx` | Wire badge to hook, handle click-to-notification-thread |

---

### Task 1: Thread Model Changes

**Files:**
- Modify: `backend/app/models/thread.py:17-38`

- [ ] **Step 1: Add notification fields to Thread model**

In `backend/app/models/thread.py`, add two fields to the `Thread` class after `token_usage`:

```python
is_notification_thread: bool = False
last_notified_at: datetime | None = None
```

The `datetime` import is already present at the top of the file.

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/thread.py
git commit -m "feat: add notification thread fields to Thread model"
```

---

### Task 2: Message Type Update

**Files:**
- Modify: `backend/app/models/message.py:8-16`
- Modify: `backend/app/api/chat.py:186-194`

- [ ] **Step 1: Add "notification" to Message type literal**

In `backend/app/models/message.py`, update the `type` field:

```python
type: Literal["text", "markdown", "feynman_input", "tool_call", "tool_result", "plan_card", "interview_questions", "notification"]
```

- [ ] **Step 2: Add "notification" to save_message type literal**

In `backend/app/api/chat.py`, update the `msg_type` parameter in `save_message()` (line ~186):

```python
msg_type: Literal[
    "text",
    "markdown",
    "feynman_input",
    "tool_call",
    "tool_result",
    "plan_card",
    "interview_questions",
    "notification",
],
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/message.py backend/app/api/chat.py
git commit -m "feat: add notification message type"
```

---

### Task 3: Notification Prompt Addendum

**Files:**
- Modify: `backend/app/agent/prompts.py`

- [ ] **Step 1: Add notification addendum constant**

Add at the end of `backend/app/agent/prompts.py`:

```python
EBBINGHAUS_NOTIFICATION_ADDENDUM = """\
You are sending a proactive nudge to the learner. Based on the review data below, \
craft a short, warm reminder (2-3 sentences) about what they should revisit and why. \
Do not ask open-ended questions — just nudge them toward the specific topic. \
Be specific about what they were learning and why now is a good time to revisit it."""
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/agent/prompts.py
git commit -m "feat: add Ebbinghaus notification prompt addendum"
```

---

### Task 4: Notify Endpoint

**Files:**
- Create: `backend/app/api/notify.py`
- Modify: `backend/main.py`

This is the core task. The endpoint:
1. Finds or creates the notification thread
2. Checks the 30-min dedup guard
3. Selects one item to notify about (most overdue review or stalest incomplete topic)
4. Runs the Ebbinghaus agent with notification context
5. Persists the response

- [ ] **Step 1: Create the notify router**

Create `backend/app/api/notify.py`:

```python
"""Ebbinghaus proactive notification endpoint."""

import json
import logging
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

    import uuid
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
    mongo.threads().insert_one(thread.to_doc())
    return thread.to_doc()


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

    # Enrich with mastery info
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

    # Get all feynman threads with topic_slugs that have plans
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

        # Check if plan exists and has uncompleted concepts
        plan_path = PLANS_DIR / slug / "plan.md"
        if not plan_path.exists():
            continue

        tree = parse_plan(plan_path.read_text())
        if tree.first_uncompleted_concept() is None:
            continue  # fully completed

        # Find the most recent message in any thread for this topic
        latest_msg = mongo.messages().find_one(
            {"thread_id": thread["_id"], "role": {"$in": ["user", "assistant"]}},
            sort=[("created_at", -1)],
        )
        if not latest_msg:
            continue

        last_active = latest_msg["created_at"]
        if last_active > cutoff:
            continue  # touched within 24h

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

    # Pick the one untouched the longest
    candidates.sort(key=lambda c: c["last_active"])
    return candidates[0]


async def _run_ebbinghaus_notification(
    thread_doc: dict, notification_data: dict, user_id: str
) -> str:
    """Run the Ebbinghaus agent to craft a notification message. Returns the response text."""
    thread_id = thread_doc["_id"]

    # Load recent history from notification thread (last 10 messages for context)
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

    # Add the notification context as a system message (not user-visible)
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
        # Step 1: Find or create notification thread
        thread_doc = _find_or_create_notification_thread(user_id)
        thread_id = thread_doc["_id"]

        # Step 2: Dedup guard
        last_notified = thread_doc.get("last_notified_at")
        if last_notified:
            if isinstance(last_notified, str):
                last_notified = datetime.fromisoformat(last_notified)
            if last_notified.tzinfo is None:
                last_notified = last_notified.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last_notified < timedelta(minutes=DEDUP_MINUTES):
                return NotifyResponse(notified=False, thread_id=thread_id)

        # Step 3: Select notification item
        item = _get_most_overdue_review(user_id)
        if not item:
            item = _get_stalest_incomplete_topic(user_id)
        if not item:
            return NotifyResponse(notified=False, thread_id=thread_id)

        # Step 4: Run agent
        response_text = await _run_ebbinghaus_notification(thread_doc, item, user_id)
        if not response_text.strip():
            return NotifyResponse(notified=False, thread_id=thread_id)

        # Step 5: Persist the assistant message
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

        # Step 6: Update last_notified_at
        mongo.threads().update_one(
            {"_id": thread_id},
            {"$set": {"last_notified_at": utcnow()}},
        )

        return NotifyResponse(notified=True, thread_id=thread_id)

    except Exception:
        logger.exception("Ebbinghaus notification failed")
        return NotifyResponse(notified=False, thread_id=None)
```

- [ ] **Step 2: Register the router in main.py**

In `backend/main.py`, add the import and include:

```python
from app.api.notify import router as notify_router
```

And in the router registration section:

```python
app.include_router(notify_router)
```

- [ ] **Step 3: Test manually**

```bash
cd backend && uv run uvicorn main:app --reload --port 8000
```

Then in another terminal:

```bash
curl -X POST http://localhost:8000/api/ebbinghaus/notify
```

Expected: `{"notified": false, "thread_id": "<some-id>"}` (since there are likely no overdue reviews or stale topics in dev). Verify the notification thread was created in MongoDB.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/notify.py backend/main.py
git commit -m "feat: add POST /api/ebbinghaus/notify endpoint"
```

---

### Task 5: Frontend API Functions

**Files:**
- Create: `client/lib/api-notify.ts`

- [ ] **Step 1: Create API functions**

Create `client/lib/api-notify.ts`:

```typescript
const API_BASE = "http://localhost:8000/api";

export interface NotifyResponse {
  notified: boolean;
  thread_id: string | null;
}

export interface NotificationMessage {
  _id: string;
  role: "assistant" | "user" | "system";
  content: string;
  type: string;
  created_at: string;
}

export async function triggerNotify(): Promise<NotifyResponse> {
  const res = await fetch(`${API_BASE}/ebbinghaus/notify`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Notify request failed");
  return res.json();
}

export async function getNotificationMessages(
  threadId: string,
): Promise<NotificationMessage[]> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/messages`);
  if (!res.ok) throw new Error("Failed to fetch notification messages");
  const data = await res.json();
  return data.messages ?? [];
}
```

- [ ] **Step 2: Commit**

```bash
git add client/lib/api-notify.ts
git commit -m "feat: add notification API client functions"
```

---

### Task 6: useEbbinghausNotifications Hook

**Files:**
- Create: `client/hooks/use-ebbinghaus-notifications.ts`

- [ ] **Step 1: Create the hook**

Create `client/hooks/use-ebbinghaus-notifications.ts`:

```typescript
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  triggerNotify,
  getNotificationMessages,
} from "@/lib/api-notify";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const LS_KEY_PREFIX = "ebbinghaus-last-seen-";

function getLastSeenId(threadId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${LS_KEY_PREFIX}${threadId}`);
}

function setLastSeenId(threadId: string, messageId: string) {
  localStorage.setItem(`${LS_KEY_PREFIX}${threadId}`, messageId);
}

export function useEbbinghausNotifications() {
  // Counter to force re-derive after markAsRead writes to localStorage
  const [, setVersion] = useState(0);
  const queryClient = useQueryClient();

  // Poll the notify endpoint
  const { data: notifyData, isLoading } = useQuery({
    queryKey: ["ebbinghaus-notify"],
    queryFn: triggerNotify,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: false,
  });

  const notificationThreadId = notifyData?.thread_id ?? null;

  // Fetch messages to compute unread count
  const { data: messages } = useQuery({
    queryKey: ["ebbinghaus-notification-messages", notificationThreadId],
    queryFn: () => getNotificationMessages(notificationThreadId!),
    enabled: !!notificationThreadId,
    refetchInterval: POLL_INTERVAL,
  });

  // Derive unread count directly from messages + localStorage
  const unreadCount = (() => {
    if (!messages || !notificationThreadId) return 0;
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    if (assistantMessages.length === 0) return 0;
    const lastSeenId = getLastSeenId(notificationThreadId);
    if (!lastSeenId) return assistantMessages.length;
    const lastSeenIdx = assistantMessages.findIndex((m) => m._id === lastSeenId);
    if (lastSeenIdx === -1) return assistantMessages.length;
    return assistantMessages.length - lastSeenIdx - 1;
  })();

  function markAsRead() {
    if (!messages || !notificationThreadId) return;
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const last = assistantMessages[assistantMessages.length - 1];
    if (last) {
      setLastSeenId(notificationThreadId, last._id);
      setVersion((v) => v + 1); // trigger re-render to re-derive unreadCount
    }
  }

  return {
    unreadCount,
    notificationThreadId,
    isLoading,
    markAsRead,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/hooks/use-ebbinghaus-notifications.ts
git commit -m "feat: add useEbbinghausNotifications hook"
```

---

### Task 7: Wire Sidebar to Notifications

**Files:**
- Modify: `client/components/app-sidebar.tsx`

- [ ] **Step 1: Import the hook and wire the badge**

In `client/components/app-sidebar.tsx`:

Add import:

```typescript
import { useEbbinghausNotifications } from "@/hooks/use-ebbinghaus-notifications";
```

Inside the `AppSidebar` component, add after the existing hooks:

```typescript
const { unreadCount, notificationThreadId, markAsRead } = useEbbinghausNotifications();
```

- [ ] **Step 2: Update the Ebbinghaus click handler and badge**

Replace the Ebbinghaus `SidebarMenuItem` block (lines 71-80) with:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    isActive={activeAgent === "ebbinghaus"}
    onClick={() => {
      if (unreadCount > 0 && notificationThreadId) {
        markAsRead();
        setActiveAgent("ebbinghaus");
        router.push(`/threads/${notificationThreadId}`);
      } else {
        handleAgentNav("ebbinghaus");
      }
    }}
  >
    <Image src="/ebbinghaus.png" alt="Ebbinghaus" width={28} height={28} className={`h-7 w-7 object-cover object-top ${logoClass}`} />
    <span>Ebbinghaus</span>
  </SidebarMenuButton>
  {unreadCount > 0 && (
    <SidebarMenuBadge>{unreadCount}</SidebarMenuBadge>
  )}
</SidebarMenuItem>
```

- [ ] **Step 3: Verify in browser**

Run `pnpm dev` in `client/`. The Ebbinghaus sidebar item should:
- Show no badge when there are no unread notifications
- Show a count badge when notifications exist
- Navigate to the notification thread when clicked with unreads
- Navigate normally when clicked without unreads

- [ ] **Step 4: Commit**

```bash
git add client/components/app-sidebar.tsx
git commit -m "feat: wire Ebbinghaus sidebar badge to notification hook"
```

---

### Task 8: End-to-End Smoke Test

- [ ] **Step 1: Start both servers**

```bash
# Terminal 1
cd backend && uv run uvicorn main:app --reload --port 8000

# Terminal 2
cd client && pnpm dev
```

- [ ] **Step 2: Trigger a notification manually**

```bash
curl -X POST http://localhost:8000/api/ebbinghaus/notify
```

If there are no due reviews or stale topics, temporarily lower the 24h threshold to 0h in `notify.py` (`timedelta(hours=0)`) to force a notification for any incomplete topic.

- [ ] **Step 3: Verify the flow**

1. Check that the notification thread was created in MongoDB
2. Check that Ebbinghaus's response was saved as a `notification` type message
3. Refresh the frontend — the badge should appear on the Ebbinghaus sidebar item
4. Click Ebbinghaus — should navigate to the notification thread
5. Badge should disappear after viewing

- [ ] **Step 4: Restore the 24h threshold if modified, commit any fixes**

```bash
git add -u
git commit -m "fix: post-smoke-test adjustments"
```
