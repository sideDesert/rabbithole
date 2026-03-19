# Ebbinghaus Proactive Notifications

## Problem

The user has no way to know when they should revisit a topic or when they've left something incomplete. Ebbinghaus should proactively nudge the user about due reviews and stale topics.

## Design

### Backend Endpoint: `POST /api/ebbinghaus/notify`

No request body. Uses the same hardcoded `user_id="user_001"` pattern as the existing practice endpoints.

**Flow:**

1. **Dedup guard first:** Find-or-create the notifications thread (see Thread Model Changes). If `last_notified_at` is less than 30 minutes ago, short-circuit — return `{ notified: false, thread_id }` without querying reviews or topics.
2. Fetch due reviews (spaced repetition items past their scheduled date) and incomplete topics (Feynman threads with unfinished plan concepts).
3. Select **one** item to notify about, prioritized:
   - Most overdue review (if any reviews are past their scheduled date).
   - Stalest incomplete topic (see Notification Selection Logic below).
4. If neither condition is met, return `{ notified: false, thread_id }`.
5. Inject the selected item's data (concept name, mastery tier, due date or last-touched date) as a system message into the agent context. This is context for the agent, not a persisted user-visible message. The system message should instruct Ebbinghaus to craft a short, proactive nudge about this specific item — not start a general conversation.
6. Run the Ebbinghaus agent via `Runner.run_streamed()` (non-streaming, just `Runner.run()` is fine since the user isn't watching live). She crafts a personalized nudge.
7. Persist the assistant response to the notifications thread.
8. Update `last_notified_at` on the thread.
9. Return `{ notified: true, thread_id }`.
10. On any failure (LLM error, DB error), log the error and return `{ notified: false, thread_id: null }`.

### Notification Selection Logic

One nudge per cycle, about the single most important thing:

1. **Due reviews first.** Query pending tests where `scheduled_for <= now`. Pick the most overdue (earliest `scheduled_for`).
2. **Stalest incomplete topic.** If no reviews are due, query **Feynman threads** (`agent="feynman"`) that have associated plans with uncompleted concepts. Determine staleness by querying the most recent Message document per thread (`messages.find({"thread_id": X}).sort("created_at", -1).limit(1)`). Filter to those where the latest message is older than 24 hours. Pick the one untouched the longest.

### Thread Model Changes

Add two fields to the `Thread` model:

- `is_notification_thread: bool = False` — marks the single dedicated notifications thread.
- `last_notified_at: datetime | None = None` — timestamp of the last notification sent to this thread. Used for dedup.

The notifications thread is created with `agent="ebbinghaus"`, `phase="teaching"`, `is_notification_thread=True`, and a fixed title like "Notifications".

### Agent Prompt for Notifications

The Ebbinghaus agent's general system prompt is a memory companion. For notification messages, a **prompt addendum** is injected as part of the system context:

> "You are sending a proactive nudge to the learner. Based on the review data below, craft a short, warm reminder (2-3 sentences) about what they should revisit and why. Do not ask open-ended questions — just nudge them toward the specific topic."

This addendum is prepended to the injected review data in the system message.

### Notification Thread Context Windowing

The notifications thread will grow over time. When loading history for the agent, use the existing `COMPACTION_THRESHOLD` mechanism — only load the most recent N messages as context, same as other threads.

### Frontend: `useEbbinghausNotifications` Hook

Lives in `client/hooks/use-ebbinghaus-notifications.ts`.

**Behavior:**

- On mount: calls `POST /api/ebbinghaus/notify`.
- Polls every 5 minutes.
- Exposes `{ unreadCount, notificationThreadId, isLoading, markAsRead }`.
- Tracks unread state via `lastSeenMessageId` stored in `localStorage` keyed by the notification thread ID.
- On each notify response, fetches the notifications thread's messages and compares against `lastSeenMessageId` to derive `unreadCount` (count of assistant messages after the last seen one).
- `markAsRead()` updates `lastSeenMessageId` in localStorage and resets `unreadCount` to 0.

The backend does **not** return `unread_count` — unread tracking is purely client-side via localStorage.

### Sidebar Changes

- Mount `useEbbinghausNotifications` in `AppSidebar`.
- `SidebarMenuBadge` on the Ebbinghaus item shows `unreadCount`. Hidden when 0.
- Clicking Ebbinghaus when there are unread notifications navigates to the notifications thread (`/threads/<notificationThreadId>`) and calls `markAsRead()`. When there are no unreads, clicking Ebbinghaus uses the existing `handleAgentNav("ebbinghaus")` behavior.

### Notifications Thread UX

- Single persistent thread for all of Ebbinghaus's proactive nudges.
- Appears in the Ebbinghaus thread list like any other thread, pinned or distinguished at the top.
- Opening it shows a running conversation of Ebbinghaus's nudges over time.
- The user can respond to any nudge, continuing the conversation naturally (the existing chat endpoint handles `agent="ebbinghaus"` + `phase="teaching"` correctly).

## Out of Scope

- Push notifications (browser/mobile).
- Multiple simultaneous nudges per cycle.
- User-configurable notification frequency or quiet hours.
- Multi-tab dedup (the 30-min server-side guard handles this sufficiently).
