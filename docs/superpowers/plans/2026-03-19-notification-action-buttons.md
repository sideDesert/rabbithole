# Notification Action Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken PlanCreatedCard on the Ebbinghaus notification page and replace it with contextual action buttons ("Continue Topic" / "Take Test") that match the notification type.

**Architecture:** Store notification metadata (type, topic_slug, concept_name) alongside the message in MongoDB. On the frontend, render notification messages as normal ChatMessages with an inline action widget below them. The widget reads the metadata to show the right button.

**Tech Stack:** Python/FastAPI (backend), React/Next.js (frontend), MongoDB

---

### Task 1: Backend — Store notification metadata in the message

**Files:**
- Modify: `backend/app/models/message.py`
- Modify: `backend/app/api/notify.py:211-222`
- Modify: `backend/app/api/chat.py:580-589`

The Message model has no metadata field. We need to add one so the notification type/slug/concept are persisted and returned to the frontend.

- [ ] **Step 1: Add `metadata` field to Message model**

In `backend/app/models/message.py`, add an optional metadata dict:

```python
from typing import Any, Literal

from pydantic import Field

from app.models.base import MongoBase, new_object_id


class Message(MongoBase):
    user_id: str
    thread_id: str
    role: Literal["user", "assistant", "system"]
    content: str | dict[str, Any]
    type: Literal["text", "markdown", "feynman_input", "tool_call", "tool_result", "plan_card", "interview_questions", "notification"]
    status: Literal["pending", "streaming", "complete", "error"] = "complete"
    group_id: str = Field(default_factory=new_object_id)
    index: int = 0
    metadata: dict[str, Any] | None = None
```

- [ ] **Step 2: Store the notification item data when creating the message**

In `backend/app/api/notify.py`, pass metadata when creating the notification message. Change the message creation block (~line 212-222):

```python
msg = Message(
    user_id=user_id,
    thread_id=thread_id,
    role="assistant",
    content=response_text,
    type="notification",
    group_id=group_id,
    index=0,
    metadata={
        "notification_type": item["type"],
        "topic_slug": item.get("topic_slug", ""),
        "concept_name": item.get("concept_name") or item.get("next_concept") or "",
    },
)
```

- [ ] **Step 3: Return metadata in get_messages endpoint**

In `backend/app/api/chat.py`, include metadata in the response dict (~line 580-589):

```python
for doc in docs:
    entry: dict[str, object] = {
        "id": str(doc.get("_id", "")),
        "role": str(doc["role"]),
        "content": str(doc["content"]),
        "type": str(doc.get("type", "text")),
    }
    if doc.get("metadata"):
        entry["metadata"] = doc["metadata"]
    messages.append(entry)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/message.py backend/app/api/notify.py backend/app/api/chat.py
git commit -m "feat: store notification metadata (type, topic_slug, concept) in message"
```

---

### Task 2: Frontend — Update types and message mapping for notification metadata

**Files:**
- Modify: `client/lib/api-notify.ts`
- Modify: `client/hooks/use-chat.ts:104-143`

- [ ] **Step 1: Add metadata to NotificationMessage type**

In `client/lib/api-notify.ts`, update the interface:

```typescript
export interface NotificationMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  type: string;
  metadata?: {
    notification_type: "overdue_review" | "stale_topic";
    topic_slug: string;
    concept_name: string;
  };
}
```

- [ ] **Step 2: Update ChatMessage type and message mapping in use-chat.ts**

In `client/hooks/use-chat.ts`, add notification metadata to the ChatMessage interface:

```typescript
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type?: "text" | "plan_card" | "phase_divider" | "notification";
  metadata?: {
    topicSlug?: string;
    notificationType?: "overdue_review" | "stale_topic";
    conceptName?: string;
  };
  statusMessage?: string;
  toolCalls?: ToolCallEntry[];
}
```

Then in the message mapping loop (~line 138-143), handle notification type:

```typescript
if (m.type === "notification") {
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    type: "notification" as const,
    metadata: {
      topicSlug: (m as any).metadata?.topic_slug ?? "",
      notificationType: (m as any).metadata?.notification_type ?? "stale_topic",
      conceptName: (m as any).metadata?.concept_name ?? "",
    },
  };
}
return {
  id: m.id,
  role: m.role as "user" | "assistant",
  content: m.content,
};
```

- [ ] **Step 3: Commit**

```bash
git add client/lib/api-notify.ts client/hooks/use-chat.ts
git commit -m "feat: thread notification metadata through to frontend ChatMessage"
```

---

### Task 3: Frontend — Create NotificationActionCard component

**Files:**
- Create: `client/components/notification-action-card.tsx`

A small inline widget that renders below a notification message. Shows "Continue Topic" for stale topics, "Take Test" for overdue reviews. Both navigate to the appropriate thread/page.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, GraduationCap, ClipboardCheck } from "lucide-react";
import { useStudyTopics } from "@/hooks/use-study-topics";

interface NotificationActionCardProps {
  notificationType: "overdue_review" | "stale_topic";
  topicSlug: string;
  conceptName: string;
}

export function NotificationActionCard({
  notificationType,
  topicSlug,
  conceptName,
}: NotificationActionCardProps) {
  const router = useRouter();
  const { topics } = useStudyTopics();
  const topic = topics.find((t) => t.topic_slug === topicSlug);

  if (!topic) return null;

  const threadId = topic.latest_thread.id;

  if (notificationType === "stale_topic") {
    return (
      <button
        onClick={() => router.push(`/threads/${threadId}`)}
        className="inline-flex items-center gap-1.5 rounded-md border-2 border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground neo-hover transition-colors cursor-pointer"
      >
        <GraduationCap className="size-3" />
        Continue Learning
        <ArrowRight className="size-3" />
      </button>
    );
  }

  return (
    <button
      onClick={() =>
        router.push(`/practice?topic=${encodeURIComponent(topicSlug)}&concept=${encodeURIComponent(conceptName)}`)
      }
      className="inline-flex items-center gap-1.5 rounded-md border-2 border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground neo-hover transition-colors cursor-pointer"
    >
      <ClipboardCheck className="size-3" />
      Take Test
      <ArrowRight className="size-3" />
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/components/notification-action-card.tsx
git commit -m "feat: add NotificationActionCard component"
```

---

### Task 4: Frontend — Wire up notification rendering in ChatPage

**Files:**
- Modify: `client/components/chat-page.tsx:196-251`

Replace the broken PlanCreatedCard rendering for notification messages with ChatMessage + NotificationActionCard.

- [ ] **Step 1: Add import for NotificationActionCard**

At top of `client/components/chat-page.tsx`, add:

```typescript
import { NotificationActionCard } from "@/components/notification-action-card";
```

- [ ] **Step 2: Update the message rendering loop**

In the message map (~line 196), add a case for notification messages. Insert this BEFORE the plan_card check:

```tsx
if (msg.type === "notification") {
  return (
    <div key={msg.id} className="flex flex-col gap-2">
      <ChatMessage
        id={msg.id}
        role={msg.role as typeof ROLE_AI}
        content={msg.content}
        isLast={messages.length - 1 === index}
        isStreaming={false}
        isLoading={false}
        agent={agent}
      />
      {msg.metadata?.notificationType && msg.metadata?.topicSlug && (
        <NotificationActionCard
          notificationType={msg.metadata.notificationType}
          topicSlug={msg.metadata.topicSlug}
          conceptName={msg.metadata.conceptName ?? ""}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/components/chat-page.tsx
git commit -m "feat: render notification messages with action buttons in ChatPage"
```

---

### Task 5: Fix the broken fallback PlanCreatedCard on notification threads

**Files:**
- Modify: `client/app/threads/[threadId]/page.tsx:281-287`

The fallback PlanCreatedCard renders when `thread.phase === "teaching"` and no plan_card messages exist. The notification thread matches this condition because it has `phase="teaching"` and `topic_slug="__notifications__"`. We need to exclude notification threads.

- [ ] **Step 1: Add is_notification_thread guard**

At ~line 281, add a check to exclude notification threads from the fallback:

```tsx
{thread?.depth === 0 &&
  thread?.phase === "teaching" &&
  !thread?.is_notification_thread &&
  !isStreaming &&
  thread.topic_slug &&
  !messages.some((m) => m.type === "plan_card") && (
    <PlanCreatedCard topicSlug={thread.topic_slug} />
  )}
```

Note: This requires `is_notification_thread` to be returned by the thread API. Check if it's already included; if not, ensure the thread endpoint returns it.

- [ ] **Step 2: Also add notification rendering in the thread detail page message loop**

In the message map at ~line 225, add the same notification handling as Task 4 (before the plan_card check):

```tsx
if (msg.type === "notification") {
  return (
    <div key={msg.id} className="flex flex-col gap-2">
      <ChatMessage
        id={msg.id}
        role={msg.role as typeof ROLE_AI}
        content={msg.content}
        isLast={messages.length - 1 === index}
        isStreaming={false}
        isLoading={false}
        agent={displayAgent}
      />
      {msg.metadata?.notificationType && msg.metadata?.topicSlug && (
        <NotificationActionCard
          notificationType={msg.metadata.notificationType}
          topicSlug={msg.metadata.topicSlug}
          conceptName={msg.metadata.conceptName ?? ""}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/app/threads/[threadId]/page.tsx
git commit -m "fix: exclude notification threads from fallback PlanCreatedCard, add notification rendering"
```

---

### Task 6: Verify the practice page accepts query params for deep-linking

**Files:**
- Modify (if needed): `client/app/practice/page.tsx`

The "Take Test" button navigates to `/practice?topic=...&concept=...`. Verify the practice page reads these query params to auto-start a test. If it doesn't, this is a known gap — note it for follow-up but don't block this plan on it.

- [ ] **Step 1: Check if practice page reads query params**

Read `client/app/practice/page.tsx` and check if it uses `useSearchParams()` to read `topic` and `concept` params.

- [ ] **Step 2: If not supported, add a simple auto-start flow or change the button to navigate to the topic thread instead**

Fallback: change the "Take Test" button to navigate to `/threads/{threadId}` with a query param like `?action=test` that could be handled later, or simply navigate to the thread so the user can start a test from there.

- [ ] **Step 3: Commit if changes needed**

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && uv run uvicorn main:app --reload --port 8000
cd client && pnpm dev
```

- [ ] **Step 2: Trigger a notification**

```bash
curl -X POST http://localhost:8000/api/ebbinghaus/notify
```

- [ ] **Step 3: Verify**

1. Navigate to `/ebbinghaus` — notification should render as a ChatMessage with Ms. Ebbinghaus branding
2. Action button should appear below the message text
3. "Continue Learning" button should navigate to the topic's latest thread
4. No broken PlanCreatedCard with "__notifications__" title
5. Navigate to the notification thread directly via `/threads/{thread_id}` — same correct rendering, no fallback PlanCreatedCard
