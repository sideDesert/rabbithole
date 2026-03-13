# Thought Trail Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple thinking orb with an engaging stacked trail of whimsical status lines that show tool calls, phase transitions, and memory operations during chat streaming.

**Architecture:** New `ThoughtTrail` presentational component + `trail-labels.ts` mapping file. The `use-chat.ts` hook accumulates trail steps per-message from SSE events. A small backend change adds tool name to `tool_result` SSE events. Phase transitions render as horizontal dividers in the chat flow.

**Tech Stack:** React 19, TypeScript, Tailwind CSS (v4, OKLch colors), Next.js App Router, FastAPI (backend)

**Spec:** `docs/superpowers/specs/2026-03-13-thought-trail-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `client/lib/trail-labels.ts` | SSE step/tool name → whimsical label mapping |
| Create | `client/components/thought-trail.tsx` | Presentational trail component (dots, pulse, collapse toggle) |
| Modify | `client/lib/api.ts:22` | Fix `tool_result` type: `result` should be `string` |
| Modify | `client/hooks/use-chat.ts:13-18,27-39,46-51,130-236,275-287` | Extend ChatMessage type, add trail state, new SSE handlers |
| Modify | `client/components/chat-message.tsx:8-17,36-97` | Consume trail props, render ThoughtTrail, render phase dividers |
| Modify | `client/app/threads/[threadId]/page.tsx:120-154` | Pass trail props through to ChatMessage, handle phase_divider type |
| Modify | `client/app/globals.css:133-190` | Remove thinking-orb/gradient-spinner, add trail-dot-pulse animation |
| Modify | `backend/app/api/chat.py:628-666` | Add `last_tool_name` tracking, include name in tool_result SSE |

---

## Chunk 1: Foundation (Labels + Types + Backend Fix)

### Task 1: Create trail-labels.ts

**Files:**
- Create: `client/lib/trail-labels.ts`

- [ ] **Step 1: Create the label mapping file**

```typescript
// client/lib/trail-labels.ts

const statusLabels: Record<string, string> = {
  load_thread: "Retracing your steps...",
  build_context: "Piecing things together...",
  load_history: "Thumbing through notes...",
  store_memory: "Committing to memory...",
  build_agent: "Warming up...",
  thinking: "Mulling it over...",
  save_message: "Tucking that away...",
  save_response: "Tidying up...",
};

const toolCallLabels: Record<string, string> = {
  recall_memory: "Rummaging...",
  store_memory: "Jotting down...",
  create_plan: "Sketching a roadmap...",
  read_plan: "Checking the map...",
  update_plan_progress: "Ticking off progress...",
  suggest_branches: "Spotting rabbit holes...",
};

export function getTrailLabel(
  type: "status" | "tool_call",
  key: string,
): string {
  const map = type === "status" ? statusLabels : toolCallLabels;
  return map[key] ?? key.toLowerCase();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/lib/trail-labels.ts
git commit -m "feat: add trail label mapping for SSE events"
```

---

### Task 2: Fix SSEEvent tool_result type

**Files:**
- Modify: `client/lib/api.ts:22`

- [ ] **Step 1: Fix the type mismatch**

In `client/lib/api.ts`, change line 22 from:
```typescript
  | { type: "tool_result"; name: string; result: Record<string, unknown> }
```
to:
```typescript
  | { type: "tool_result"; name: string; result: string }
```

- [ ] **Step 2: Commit**

```bash
git add client/lib/api.ts
git commit -m "fix: correct tool_result SSE type — result is string not object"
```

---

### Task 3: Backend — add tool name to tool_result SSE

**Files:**
- Modify: `backend/app/api/chat.py:628-666`

- [ ] **Step 1: Add tool name queue**

In `backend/app/api/chat.py`, find the line `full_text = ""` (around line 648) and add a tool name queue after `tool_names_called`:

```python
        tool_names_called: list[str] = []
        pending_tool_names: list[str] = []
        new_topic_slug = ""
```

- [ ] **Step 2: Enqueue tool name on tool_call_item**

In the `tool_call_item` branch (around line 668), after `tool_names_called.append(tool_name)`, add:

```python
                        pending_tool_names.append(tool_name)
```

- [ ] **Step 3: Dequeue tool name in tool_result SSE**

In the `tool_call_output_item` branch (around line 678), change:

```python
                    yield sse(
                        {
                            "type": "tool_result",
                            "result": output[:500],
                        }
                    )
```

to:

```python
                    result_tool_name = pending_tool_names.pop(0) if pending_tool_names else ""
                    yield sse(
                        {
                            "type": "tool_result",
                            "name": result_tool_name,
                            "result": output[:500],
                        }
                    )
```

This uses a FIFO queue so that when multiple tool calls fire before results return, each result is matched to the correct tool name in order.

- [ ] **Step 4: Verify backend still runs**

Run: `cd backend && uv run ruff check app/api/chat.py`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/chat.py
git commit -m "feat: include tool name in tool_result SSE events"
```

---

### Task 4: Extend ChatMessage type in use-chat.ts

**Files:**
- Modify: `client/hooks/use-chat.ts:13-18`

- [ ] **Step 1: Add trail fields and phase_divider type to ChatMessage**

In `client/hooks/use-chat.ts`, change the `ChatMessage` interface from:

```typescript
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type?: "text" | "plan_card";
  metadata?: { topicSlug?: string };
}
```

to:

```typescript
export interface TrailStep {
  key: string;
  label: string;
  type: "status" | "tool_call";
  done: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type?: "text" | "plan_card" | "phase_divider";
  metadata?: { topicSlug?: string };
  trailSteps?: TrailStep[];
  trailCollapsed?: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/hooks/use-chat.ts
git commit -m "feat: extend ChatMessage with trail step and phase divider types"
```

---

## Chunk 2: ThoughtTrail Component + CSS

### Task 5: Add trail-dot-pulse animation to globals.css

**Files:**
- Modify: `client/app/globals.css:133-190`

- [ ] **Step 1: Remove thinking-orb and gradient-spinner CSS, add trail animation**

Remove the `.thinking-orb` block (lines ~133-149), the `.gradient-spinner` block (lines ~161-185), and the `@keyframes spinner-rotate` block (lines ~186-189). Keep `@keyframes orb-shift` if it's used elsewhere (check first).

Add this new animation:

```css
@keyframes trail-dot-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

.trail-dot-pulse {
  animation: trail-dot-pulse 1.5s ease-in-out infinite;
}
```

- [ ] **Step 2: Verify no other component references thinking-orb or gradient-spinner**

Run from `client/`: `grep -r "thinking-orb\|gradient-spinner" --include="*.tsx" --include="*.ts" .`

The only references should be in `chat-message.tsx` (which we'll update in Task 7). If there are others, note them for Task 7.

- [ ] **Step 3: Commit**

```bash
git add client/app/globals.css
git commit -m "feat: replace thinking-orb/spinner CSS with trail-dot-pulse animation"
```

---

### Task 6: Create ThoughtTrail component

**Files:**
- Create: `client/components/thought-trail.tsx`

- [ ] **Step 1: Create the component**

```tsx
// client/components/thought-trail.tsx

import type { TrailStep } from "@/hooks/use-chat";

interface ThoughtTrailProps {
  steps: TrailStep[];
  collapsed: boolean;
  onToggle: () => void;
}

export function ThoughtTrail({ steps, collapsed, onToggle }: ThoughtTrailProps) {
  if (steps.length === 0) return null;

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer mb-1"
      >
        ⋯ {steps.length} steps
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 mb-2">
      {steps.map((step, i) => (
        <div
          key={`${step.key}-${i}`}
          className="flex items-center gap-2 animate-in fade-in duration-200"
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground ${
              step.type === "tool_call" && !step.done
                ? "trail-dot-pulse"
                : "opacity-40"
            }`}
          />
          <span className="text-sm text-muted-foreground">{step.label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/components/thought-trail.tsx
git commit -m "feat: add ThoughtTrail presentational component"
```

---

## Chunk 3: Hook Wiring (use-chat.ts SSE Handlers)

### Task 7: Wire SSE events to trail steps in use-chat.ts

**Files:**
- Modify: `client/hooks/use-chat.ts:1-3,27-39,46-51,130-236,275-287`

This is the largest task. It modifies the `use-chat.ts` hook to:
1. Remove `isWaiting` and `statusMessage` state
2. Add trail step accumulation per-message via SSE events
3. Add `tool_call` and `tool_result` case branches
4. Modify `stream`, `interview_questions`, `phase_change`, `plan_created`, and `end` handlers
5. Expose `toggleTrailCollapsed` for the toggle interaction

- [ ] **Step 1: Add import for getTrailLabel**

At the top of `client/hooks/use-chat.ts`, add:

```typescript
import { getTrailLabel } from "@/lib/trail-labels";
```

- [ ] **Step 2: Remove isWaiting and statusMessage state, update return type**

Remove these lines:
```typescript
const [isWaiting, setIsWaiting] = useState(false);
const [statusMessage, setStatusMessage] = useState<string | null>(null);
```

Update the `UseChatReturn` interface — remove `isWaiting` and `statusMessage`, add `toggleTrailCollapsed`:

```typescript
interface UseChatReturn {
  messages: ChatMessage[];
  isMessagesLoading: boolean;
  phase: string;
  isStreaming: boolean;
  threadId: string | null;
  interviewQuestions: InterviewQuestion[] | null;
  send: (content: string) => Promise<void>;
  submitInterviewAnswers: (answers: Record<number, string>) => Promise<void>;
  dismissInterview: () => void;
  toggleTrailCollapsed: (messageId: string) => void;
}
```

- [ ] **Step 3: Add toggleTrailCollapsed callback**

After the `dismissInterview` callback, add:

```typescript
const toggleTrailCollapsed = useCallback(
  (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, trailCollapsed: !m.trailCollapsed }
          : m,
      ),
    );
  },
  [],
);
```

- [ ] **Step 4: Update the send function — remove isWaiting/statusMessage, init trail on AI message**

In the `send` callback, remove:
```typescript
setIsWaiting(true);
setStatusMessage(null);
```

Rename `waitingCleared` to `trailCollapsedRef` throughout the hook. Keep the reset line:
```typescript
trailCollapsedRef.current = false;
```

Change the AI message initialization from:
```typescript
setMessages((prev) => [
  ...prev,
  { id: aiMsgId, role: "assistant", content: "" },
]);
```
to:
```typescript
setMessages((prev) => [
  ...prev,
  { id: aiMsgId, role: "assistant", content: "", trailSteps: [], trailCollapsed: false },
]);
```

- [ ] **Step 5: Helper — function to push a trail step onto the current AI message**

Add this helper inside the `send` callback, right before the `await streamChat(...)` call:

```typescript
const pushTrailStep = (step: TrailStep) => {
  setMessages((prev) =>
    prev.map((m) =>
      m.id === currentAiMsgId
        ? { ...m, trailSteps: [...(m.trailSteps ?? []), step] }
        : m,
    ),
  );
};

const replaceOrPushTrailStep = (step: TrailStep) => {
  setMessages((prev) =>
    prev.map((m) => {
      if (m.id !== currentAiMsgId) return m;
      const existing = (m.trailSteps ?? []).findIndex(
        (s) => s.key === step.key && s.type === "status",
      );
      if (existing >= 0) {
        const updated = [...(m.trailSteps ?? [])];
        updated[existing] = step;
        return { ...m, trailSteps: updated };
      }
      return { ...m, trailSteps: [...(m.trailSteps ?? []), step] };
    }),
  );
};

const markToolDone = (toolName: string) => {
  setMessages((prev) =>
    prev.map((m) => {
      if (m.id !== currentAiMsgId) return m;
      const steps = (m.trailSteps ?? []).map((s) =>
        s.key === toolName && s.type === "tool_call" && !s.done
          ? { ...s, done: true }
          : s,
      );
      return { ...m, trailSteps: steps };
    }),
  );
};

const collapseTrail = () => {
  setMessages((prev) =>
    prev.map((m) =>
      m.id === currentAiMsgId ? { ...m, trailCollapsed: true } : m,
    ),
  );
};
```

- [ ] **Step 6: Update the SSE event switch statement**

Replace the `status` case:
```typescript
case "status":
  pushTrailStep({
    key: event.step,
    label: getTrailLabel("status", event.step),
    type: "status",
    done: true,
  });
  console.log(`[chat] ${event.step} — ${event.duration_ms}ms`);
  break;
```

Add new `tool_call` case (after `status`):
```typescript
case "tool_call":
  replaceOrPushTrailStep({
    key: event.name,
    label: getTrailLabel("tool_call", event.name),
    type: "tool_call",
    done: false,
  });
  break;
```

Add new `tool_result` case (after `tool_call`):
```typescript
case "tool_result":
  markToolDone(event.name);
  break;
```

Update the `stream` case — replace the `isWaiting` clearing with trail collapse:
```typescript
case "stream":
  if (!waitingCleared.current) {
    waitingCleared.current = true;
    collapseTrail();
  }
  setMessages((prev) =>
    prev.map((m) =>
      m.id === currentAiMsgId
        ? { ...m, content: m.content + event.content }
        : m,
    ),
  );
  break;
```

Note: keep `waitingCleared.current` ref — it now gates trail collapse instead of `setIsWaiting`. Rename it to `trailCollapsedRef` for clarity:
- Rename declaration: `const trailCollapsedRef = useRef(false);` (replace `waitingCleared`)
- Reset in send: `trailCollapsedRef.current = false;`
- Check in stream: `if (!trailCollapsedRef.current) { trailCollapsedRef.current = true; collapseTrail(); }`

Update the `interview_questions` case:
```typescript
case "interview_questions":
  pushTrailStep({
    key: "interview_questions",
    label: "Preparing questions...",
    type: "status",
    done: true,
  });
  collapseTrail();
  pendingInterviewRef.current = event.questions;
  setInterviewQuestions(event.questions);
  break;
```

Update the `phase_change` case — add divider message:
```typescript
case "phase_change":
  setPhase(event.to);
  setMessages((prev) => [
    ...prev,
    {
      id: `phase-${++msgCounter.current}`,
      role: "system",
      content: event.to,
      type: "phase_divider",
    },
  ]);
  break;
```

Update the `plan_created` case — insert divider + plan card together:
```typescript
case "plan_created": {
  const slug = event.topic_slug;
  setMessages((prev) => [
    ...prev,
    {
      id: `phase-${++msgCounter.current}`,
      role: "system",
      content: "plan created",
      type: "phase_divider",
    },
    {
      id: `plan-card-${++msgCounter.current}`,
      role: "system",
      content: "",
      type: "plan_card",
      metadata: { topicSlug: slug },
    },
  ]);
  onPlanCreated?.(slug);
  break;
}
```

Update the `end` case — preserve messages with trail steps:
```typescript
case "end":
  if (event.duration_ms) {
    console.log(`[chat] total — ${event.duration_ms}ms`);
  }
  setMessages((prev) =>
    prev.filter(
      (m) =>
        !(
          m.role === "assistant" &&
          m.content === "" &&
          !(m.trailSteps?.length)
        ),
    ),
  );
  setIsStreaming(false);
  break;
```

Update the `error` case — stop pulsing dots and show error as message content:
```typescript
case "error":
  // Mark all in-flight tool steps as done so dots stop pulsing
  setMessages((prev) =>
    prev.map((m) => {
      if (m.id !== currentAiMsgId) return m;
      const steps = (m.trailSteps ?? []).map((s) =>
        !s.done ? { ...s, done: true } : s,
      );
      return { ...m, trailSteps: steps, content: m.content || event.content };
    }),
  );
  setIsStreaming(false);
  break;
```

- [ ] **Step 7: Update the return object**

Remove `isWaiting`, `statusMessage`. Add `toggleTrailCollapsed`:

```typescript
return {
  messages,
  isMessagesLoading: messagesLoading,
  phase,
  isStreaming,
  threadId,
  interviewQuestions,
  send,
  submitInterviewAnswers,
  dismissInterview,
  toggleTrailCollapsed,
};
```

- [ ] **Step 8: Verify no TypeScript errors**

Run: `cd client && pnpm build`

If there are errors in `chat-message.tsx` or `page.tsx` due to removed props (`isWaiting`, `statusMessage`), those will be fixed in the next tasks.

- [ ] **Step 9: Commit**

```bash
git add client/hooks/use-chat.ts
git commit -m "feat: wire SSE events to per-message trail steps in use-chat hook"
```

---

## Chunk 4: Rendering (ChatMessage + Page Integration)

### Task 8: Update chat-message.tsx — render ThoughtTrail and phase dividers

**Files:**
- Modify: `client/components/chat-message.tsx:1-97`

- [ ] **Step 1: Update the component**

Replace the entire `chat-message.tsx` with:

```tsx
import clsx from "clsx";
import React from "react";
import { Streamdown } from "streamdown";
import { ThoughtTrail } from "./thought-trail";
import type { TrailStep } from "@/hooks/use-chat";

export const ROLE_USER = "user";
export const ROLE_AI = "assistant";

interface ChatMessageInterface {
  id: string;
  content: React.ReactNode;
  role: typeof ROLE_USER | typeof ROLE_AI;
  className?: string;
  isLast?: boolean;
  trailSteps?: TrailStep[];
  trailCollapsed?: boolean;
  onTrailToggle?: () => void;
}

function lastMessageRef(id: string) {
  return (el: HTMLElement | null) => {
    if (!el) return;

    const parts = id.split("-");
    const index = parseInt(parts[1], 10);
    if (isNaN(index) || index < 1) return;

    const prevMsgId = `msg-${index - 1}`;
    const prevEl = document.querySelector(`[data-message-id="${prevMsgId}"]`);
    if (!prevEl) return;

    const h0 = prevEl.getBoundingClientRect().height;
    el.style.minHeight = `calc(100vh - 220px - ${h0}px)`;
  };
}

export function PhaseDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2 animate-in fade-in duration-300">
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted-foreground tracking-widest uppercase">
        {label}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

export function ChatMessage({
  id,
  content,
  role,
  className,
  isLast,
  trailSteps,
  trailCollapsed,
  onTrailToggle,
}: ChatMessageInterface) {
  if (role === ROLE_USER) {
    return (
      <div
        className={clsx(
          "chat-message bg-accent py-3 px-3 rounded-xl max-w-[85%]",
          className,
        )}
        data-message-id={id}
      >
        {content}
      </div>
    );
  }
  if (role === ROLE_AI) {
    const hasTrail = trailSteps && trailSteps.length > 0;

    return (
      <article
        className="chat-message max-w-full overflow-auto streamdown"
        data-message-id={id}
        ref={(el) => {
          if (!el) return;
          if (isLast) {
            lastMessageRef(id)(el);
          } else {
            el.style.minHeight = "";
          }
        }}
      >
        {hasTrail && (
          <ThoughtTrail
            steps={trailSteps}
            collapsed={trailCollapsed ?? false}
            onToggle={onTrailToggle ?? (() => {})}
          />
        )}
        <Streamdown>{content as string}</Streamdown>
      </article>
    );
  }

  return null;
}
```

Key changes:
- Removed `waiting`, `statusMessage` props (no longer exist)
- Removed thinking-orb and gradient-spinner rendering
- Added `trailSteps`, `trailCollapsed`, `onTrailToggle` props
- Added `PhaseDivider` export for use in the page
- ThoughtTrail renders above Streamdown content

- [ ] **Step 2: Commit**

```bash
git add client/components/chat-message.tsx
git commit -m "feat: render ThoughtTrail in AI messages, add PhaseDivider component"
```

---

### Task 9: Update thread page — pass trail props, render phase dividers

**Files:**
- Modify: `client/app/threads/[threadId]/page.tsx:46-154`

- [ ] **Step 1: Update useChat destructuring**

Change:
```typescript
const {
  send,
  messages,
  isMessagesLoading,
  isStreaming,
  isWaiting,
  statusMessage,
  phase,
  interviewQuestions,
  submitInterviewAnswers,
  dismissInterview,
} = useChat({
```

to:

```typescript
const {
  send,
  messages,
  isMessagesLoading,
  isStreaming,
  phase,
  interviewQuestions,
  submitInterviewAnswers,
  dismissInterview,
  toggleTrailCollapsed,
} = useChat({
```

- [ ] **Step 2: Add PhaseDivider import**

Add to the imports at the top:
```typescript
import { ChatMessage, ROLE_AI, ROLE_USER, PhaseDivider } from "@/components/chat-message";
```

- [ ] **Step 3: Update the message rendering loop**

In the `messages.map(...)` block, add a case for `phase_divider` before the default `ChatMessage` render, and update the `ChatMessage` props:

```tsx
{messages.map((msg, index) => {
  if (msg.type === "plan_card") {
    return (
      <PlanCreatedCard
        key={msg.id}
        topicSlug={msg.metadata?.topicSlug ?? ""}
      />
    );
  }
  if (msg.type === "phase_divider") {
    return <PhaseDivider key={msg.id} label={msg.content} />;
  }
  if (
    msg.role === "user" &&
    msg.content.startsWith("[Interview Answers]")
  ) {
    return (
      <div key={msg.id} className="w-fit self-end">
        <InterviewAnswersCard content={msg.content} />
      </div>
    );
  }
  return (
    <ChatMessage
      key={msg.id}
      id={msg.id}
      role={msg.role as typeof ROLE_USER | typeof ROLE_AI}
      content={msg.content}
      className={`${msg.role === ROLE_USER && "w-fit self-end"}`}
      isLast={messages.length - 1 === index}
      trailSteps={msg.trailSteps}
      trailCollapsed={msg.trailCollapsed}
      onTrailToggle={() => toggleTrailCollapsed(msg.id)}
    />
  );
})}
```

- [ ] **Step 4: Build and verify**

Run: `cd client && pnpm build`
Expected: successful build with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add client/app/threads/[threadId]/page.tsx
git commit -m "feat: integrate ThoughtTrail and PhaseDivider into thread page"
```

---

## Chunk 5: Cleanup

### Task 10: Remove unused CSS and refs

**Files:**
- Modify: `client/app/globals.css` (if thinking-orb/gradient-spinner CSS wasn't removed in Task 5)
- Modify: `client/hooks/use-chat.ts` (remove `pendingInterviewRef` if no longer needed — check)

- [ ] **Step 1: Verify globals.css is clean**

Confirm `.thinking-orb`, `.gradient-spinner`, `@keyframes spinner-rotate` are removed.
Confirm `@keyframes orb-shift` — check if anything else uses it. If not, remove it too.

Run: `cd client && grep -r "orb-shift" --include="*.tsx" --include="*.ts" --include="*.css" .`

If only `globals.css` references it, remove `@keyframes orb-shift` as well.

- [ ] **Step 2: Final build check**

Run: `cd client && pnpm build`
Expected: clean build

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: remove unused thinking-orb/spinner CSS and clean up refs"
```

---

## Manual Verification

After all tasks are complete, test end-to-end:

1. Start backend: `cd backend && uv run uvicorn main:app --reload --port 8000`
2. Start frontend: `cd client && pnpm dev`
3. Open a thread, send a message
4. **Verify:** Trail lines appear with whimsical labels as status/tool_call events stream in
5. **Verify:** Tool call dots pulse, then settle when result arrives
6. **Verify:** Trail collapses to `⋯ N steps` when text starts streaming
7. **Verify:** Clicking collapsed trail expands it back
8. **Verify:** Phase transitions show as subtle horizontal dividers
9. **Verify:** Plan created shows divider before plan card
10. **Verify:** No thinking orb or gradient spinner anywhere
