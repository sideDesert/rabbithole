# Thought Trail — Engaging Status Indicators for Chat

## Problem

The current chat UI shows a simple thinking orb + status text while waiting, and a gradient spinner while streaming. SSE events like tool calls, phase changes, memory operations, and plan creation are consumed internally but barely surfaced to the user. The learner has no sense of what the AI is doing during the 2-5 second wait before text starts streaming.

## Design Goals

- Keep the user engaged during wait times by showing what the agent is doing
- Use playful, personality-driven language (not technical jargon)
- Stay subtle — informative but never loud or distracting
- Collapse after streaming starts to keep the chat clean
- Distinguish between passive status updates and active tool calls

## Non-Goals

- No celebratory animations or banners
- No persistent status bar or sidebar
- No changes to the InterviewWidget or PlanView components themselves
- Trails are ephemeral (current session only)

---

## Design

### 1. Thought Trail

A stacked trail of small status lines that builds up where the AI message will appear, then collapses when streaming starts.

**Appearance:**
- Each line: 6px dot + text in `text-sm text-muted-foreground`
- Each line fades in with 200ms opacity transition
- Status steps: static dot (muted, ~40% opacity)
- Tool calls: dot pulses (opacity oscillates 40%→80%, 1.5s cycle) while running, settles when `tool_result` arrives

**SSE → Label mapping (keyed on `event.step` for status events, `event.name` for tool_call events):**

| SSE Event | Key | Label |
|-----------|-----|-------|
| `status` | `load_thread` | Retracing your steps... |
| `status` | `build_context` | Piecing things together... |
| `status` | `load_history` | Thumbing through notes... |
| `status` | `store_memory` | Committing to memory... |
| `status` | `build_agent` | Warming up... |
| `status` | `thinking` | Mulling it over... |
| `status` | `save_message` | Tucking that away... |
| `status` | `save_response` | Tidying up... |
| `tool_call` | `recall_memory` | Rummaging... |
| `tool_call` | `store_memory` | Jotting down... |
| `tool_call` | `create_plan` | Sketching a roadmap... |
| `tool_call` | `read_plan` | Checking the map... |
| `tool_call` | `update_plan_progress` | Ticking off progress... |
| `tool_call` | `suggest_branches` | Spotting rabbit holes... |
| `interview_questions` | (matched on `event.type`, not a key) | Preparing questions... |
| Unknown | — | Raw step/tool name in lowercase |

**Deduplication:** When a `tool_call` event fires for a name that already has a `status` event with the same key (e.g., `store_memory`), the status line is replaced rather than duplicated. The tool_call label takes precedence since it represents the active operation.

**Collapse behavior:**
- On first `stream` SSE event: the trail collapses into a single line: `⋯ N steps` in faint muted text
- On `interview_questions` event (when no `stream` event will follow): the trail also collapses after adding "Preparing questions..."
- Clicking the collapsed line toggles the full trail back open (no animation, simple toggle)

**Trail persistence:** Trails are ephemeral — they exist only in the current session's React state. When a user navigates away and returns, or loads historical messages via `getMessages()`, no trails are shown. The collapsed `⋯ N steps` toggle is only visible for messages received during the current session. This is intentional: trails are a live engagement feature, not a historical record.

### 2. Phase Transitions

When a `phase_change` SSE event fires, a horizontal divider is inserted into the chat flow.

**Appearance:**
- Thin horizontal rule using `border-border`
- Centered label in `text-xs text-muted-foreground tracking-widest uppercase`
- Example: `─────────── planning ───────────`
- Fades in over 300ms
- Permanent in chat history — acts as a chapter marker

**Insertion point:** The divider is inserted immediately after the current AI message (at the end of the messages array). It appears between the message that triggered the transition and whatever comes next.

**`plan_created` events** get the same treatment: a divider reading `plan created` inserted immediately before the plan card message.

### 3. Interview Questions Integration

When `interview_questions` SSE event fires:
1. A final trail line "Preparing questions..." is added
2. The trail collapses (since no `stream` event will follow)
3. The existing InterviewWidget renders below as-is

No changes to the InterviewWidget.

---

## Component Structure

### New: `ThoughtTrail` component

Location: `client/components/thought-trail.tsx`

Props:
- `steps: { key: string; label: string; type: 'status' | 'tool_call'; done: boolean }[]`
- `collapsed: boolean`
- `onToggle: () => void`

The `key` field stores the original event key (e.g., `"store_memory"`) — used for deduplication logic in the hook. The component itself does not use `key` but receives it for consistency.

Renders:
- When not collapsed: list of step lines with dots (pulsing for in-flight tool calls)
- When collapsed: `⋯ N steps` toggle line

Pure presentational. No SSE knowledge.

### New: `trail-labels.ts`

Location: `client/lib/trail-labels.ts`

Two mapping objects:
- `statusLabels: Record<string, string>` — keyed on `event.step`
- `toolCallLabels: Record<string, string>` — keyed on `event.name`

Export a `getTrailLabel(type: 'status' | 'tool_call', key: string): string` function. Fallback returns raw key in lowercase.

### New: Phase divider message type

A new message type `phase_divider` with content being the phase name. Rendered as a horizontal rule with centered label in `chat-message.tsx`.

### Modified: `use-chat.ts`

**Type extensions:**

The `ChatMessage` interface must be extended with:
- `trailSteps?: { key: string; label: string; type: 'status' | 'tool_call'; done: boolean }[]`
- `trailCollapsed?: boolean`

The `type` field on `ChatMessage` must also accept `"phase_divider"` (currently only `"text" | "plan_card"`).

This means trail data lives on the message itself, not as a separate global array. The current in-flight message accumulates steps; completed messages retain their steps for the duration of the session.

Event handling additions (these are **new** case branches — `tool_call` and `tool_result` do not currently have handlers):
- `status` events → push step `{ key: event.step, label: getTrailLabel('status', event.step), type: 'status', done: true }` onto current AI message's `trailSteps`
- `tool_call` events → check if a `status` step with the same `key` exists (dedup: e.g., `store_memory`); if so, replace it. Otherwise push new step `{ key: event.name, label: getTrailLabel('tool_call', event.name), type: 'tool_call', done: false }`
- `tool_result` events → find the matching `tool_call` step by name (using `event.name`) and mark `done: true`. **Note:** this requires a small backend change (see below).
- First `stream` event → set current AI message's `trailCollapsed: true`
- `interview_questions` event → push "Preparing questions..." step, then set `trailCollapsed: true`
- `phase_change` events → insert a `phase_divider` message at the end of the messages array
- `plan_created` events → in a single `setMessages` call, insert a `phase_divider` message with label "plan created" followed by the plan card message (both pushed together to avoid React batching flashes)

### Modified: `chat-message.tsx`

- AI messages read `trailSteps` and `trailCollapsed` from the message object
- `ThoughtTrail` renders above `<Streamdown>` content
- Replaces current thinking orb + status text + gradient spinner entirely
- New render path for `phase_divider` message type
- The `end` handler's empty-message cleanup filter changes from:
  `!(m.role === "assistant" && m.content === "")` to:
  `!(m.role === "assistant" && m.content === "" && !(m.trailSteps?.length))`
  This preserves tool-only responses that have trail steps but no streamed text.

---

## What Gets Removed

- The `thinking-orb` element and its CSS (`@keyframes orb-shift` can stay if used elsewhere, but the `.thinking-orb` class is removed)
- The `gradient-spinner` element and its CSS
- The `statusMessage` state (replaced by trail steps on message)
- The `isWaiting` state (replaced by `trailCollapsed` on message)

`isStreaming` stays — still needed to know when to stop appending to the AI message.

---

## Edge Cases

- **Fast responses** (trail shows 1-2 steps then immediately collapses): Fine. `⋯ 2 steps` is still informative.
- **No tool calls** (only status events): Trail shows only static dots. Still useful.
- **Error during streaming**: Trail stays expanded (never got first `stream` event). The error message renders below it.
- **Multiple tool calls in sequence**: Each gets its own line. The most recent undone one pulses, previous settled ones are static.
- **Rapid tool calls before results return**: `tool_result` matches by `event.name`, not by position. If two calls to the same tool happen (unlikely but possible), the first matching undone step is marked done.
- **Tool-only response (no streamed text)**: The `end` handler checks — if the AI message has trail steps but empty content, the message is kept (trail is the content). If it has neither, it's cleaned up.
- **Historical messages**: No trails shown. Trails are session-only.
- **Duplicate store_memory events**: The `tool_call: store_memory` replaces the `status: store_memory` line rather than adding a second line.
- **plan_created + phase_change in same response**: The backend emits `plan_created` before `phase_change`. Visual order will be: AI message → "plan created" divider → plan card → "planning" divider. This is correct — the plan is created, then the phase shifts.

---

## Backend Change (Minimal)

The `tool_result` SSE event in `backend/app/api/chat.py` currently does not include the tool name:

```python
yield sse({"type": "tool_result", "result": output[:500]})
```

Changes needed in `chat.py`:

1. Initialize `last_tool_name = ""` before the `async for event in result.stream_events()` loop (near line 631).
2. In the `tool_call_item` branch (line 656), after extracting `tool_name`, add: `last_tool_name = tool_name`.
3. In the `tool_call_output_item` branch (line 663), change the SSE to: `yield sse({"type": "tool_result", "name": last_tool_name, "result": output[:500]})`.

This is a 3-line change. The frontend `SSEEvent` type in `api.ts` already declares `name: string` on `tool_result` — the backend just needs to actually send it.

**Also:** The `SSEEvent` type in `api.ts` declares `tool_result.result` as `Record<string, unknown>`, but the backend sends a plain string. This existing type mismatch should be fixed: change the type to `result: string`.
