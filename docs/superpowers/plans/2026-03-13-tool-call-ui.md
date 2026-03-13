# Tool Call UI & Streaming Status Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show tool calls as expandable blocks in the chat UI (like Claude), fix the thinking orb disappearing, and clean up status handling.

**Architecture:** Add a `toolCalls` array to `ChatMessage`, update SSE event handlers to populate it, render tool call blocks as a new component in `chat-message.tsx`. No backend changes.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

## Chunk 1: Data model + event handling

### Task 1: Add `toolCalls` to ChatMessage and update event handlers

**Files:**
- Modify: `client/hooks/use-chat.ts:14-21` (ChatMessage interface)
- Modify: `client/hooks/use-chat.ts:172-205` (event handler switch)

- [ ] **Step 1: Add ToolCallEntry type and toolCalls field to ChatMessage**

In `client/hooks/use-chat.ts`, add above the `ChatMessage` interface:

```ts
export interface ToolCallEntry {
  name: string;
  label: string;
  status: "running" | "done";
  result?: string;
}
```

Add `toolCalls?: ToolCallEntry[]` to `ChatMessage`.

- [ ] **Step 2: Initialize toolCalls on the assistant message placeholder**

In the `send` function where the AI message is created (around line 151):

```ts
{ id: aiMsgId, role: "assistant", content: "", statusMessage: "", toolCalls: [] },
```

- [ ] **Step 3: Update `tool_call` event handler**

Replace the current `tool_call` case:

```ts
case "tool_call":
  setMessages((prev) =>
    prev.map((m) =>
      m.id === currentAiMsgId
        ? {
            ...m,
            statusMessage: undefined,
            toolCalls: [
              ...(m.toolCalls ?? []),
              { name: event.name, label: getTrailLabel("tool_call", event.name), status: "running" as const },
            ],
          }
        : m,
    ),
  );
  break;
```

- [ ] **Step 4: Update `tool_result` event handler**

Replace the current no-op `tool_result` case:

```ts
case "tool_result": {
  setMessages((prev) =>
    prev.map((m) => {
      if (m.id !== currentAiMsgId) return m;
      const updated = (m.toolCalls ?? []).map((tc) =>
        tc.name === event.name && tc.status === "running"
          ? { ...tc, status: "done" as const, result: event.result }
          : tc,
      );
      return { ...m, toolCalls: updated };
    }),
  );
  break;
}
```

- [ ] **Step 5: Remove `clearStatus()` from `stream` handler**

Change the `stream` case to only append content — remove the `clearStatus()` call:

```ts
case "stream":
  setMessages((prev) =>
    prev.map((m) =>
      m.id === currentAiMsgId
        ? { ...m, content: m.content + event.content }
        : m,
    ),
  );
  break;
```

- [ ] **Step 6: Commit**

```bash
git add client/hooks/use-chat.ts
git commit -m "feat: add toolCalls to ChatMessage and wire SSE event handlers"
```

---

## Chunk 2: Tool call UI component + orb fix

### Task 2: Create ToolCallBlock component and update ChatMessage rendering

**Files:**
- Modify: `client/components/chat-message.tsx`

- [ ] **Step 1: Add ToolCallBlock component**

Add above `ChatMessage` in `chat-message.tsx`:

```tsx
import type { ToolCallEntry } from "@/hooks/use-chat";

function ToolCallBlock({ tc }: { tc: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  const isDone = tc.status === "done";

  return (
    <div className="tool-call-block">
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
        onClick={() => tc.result && setOpen(!open)}
      >
        {isDone ? (
          <span className="text-emerald-500 text-xs">&#10003;</span>
        ) : (
          <span className="thinking-orb shrink-0 !w-3 !h-3" />
        )}
        <span>{tc.label}</span>
      </button>
      {open && tc.result && (
        <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1 mb-2 overflow-x-auto whitespace-pre-wrap">
          {tc.result}
        </pre>
      )}
    </div>
  );
}
```

Add `useState` to the React import at top of file.

- [ ] **Step 2: Fix orb logic and render tool call blocks**

In the `ChatMessage` component, update the AI branch:

```tsx
if (role === ROLE_AI) {
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const showOrb = !!statusMessage && !hasToolCalls && !(content as string);

  return (
    <article
      className="chat-message max-w-full overflow-auto streamdown"
      data-message-id={id}
      ref={(el) => {
        articleRef.current = el;
        if (!el) return;
        if (isLast) {
          lastMessageRef(id)(el);
        } else {
          el.style.minHeight = "";
        }
      }}
    >
      {showOrb && <ThinkingOrb statusMessage={statusMessage} />}
      {hasToolCalls && (
        <div className="mb-3 border-l-2 border-border pl-3 space-y-0.5">
          {toolCalls.map((tc, i) => (
            <ToolCallBlock key={`${tc.name}-${i}`} tc={tc} />
          ))}
        </div>
      )}
      <Streamdown>{content as string}</Streamdown>
    </article>
  );
}
```

Add `toolCalls` to the component props interface:

```ts
interface ChatMessageInterface {
  // ... existing
  toolCalls?: ToolCallEntry[];
}
```

- [ ] **Step 3: Pass toolCalls from page to ChatMessage**

In `client/app/threads/[threadId]/page.tsx`, the `<ChatMessage>` already receives `statusMessage={msg.statusMessage}`. Add `toolCalls={msg.toolCalls}` next to it.

- [ ] **Step 4: Commit**

```bash
git add client/components/chat-message.tsx client/app/threads/[threadId]/page.tsx
git commit -m "feat: render tool call blocks in chat messages, fix orb logic"
```

---

## Chunk 3: End-handler cleanup + CSS

### Task 3: Clean up end handler and add minimal styles

**Files:**
- Modify: `client/hooks/use-chat.ts:247-258` (end handler)
- Modify: `client/app/globals.css` (optional, if orb sizing needed)

- [ ] **Step 1: Update end handler to clear statusMessage and toolCalls on empty messages**

The `end` handler currently filters out empty assistant messages. Also clear `statusMessage`:

```ts
case "end":
  if (event.duration_ms) {
    console.log(`[chat] total -- ${event.duration_ms}ms`);
  }
  setMessages((prev) =>
    prev
      .map((m) =>
        m.id === currentAiMsgId ? { ...m, statusMessage: undefined } : m,
      )
      .filter(
        (m) => !(m.role === "assistant" && m.content === "" && !(m.toolCalls?.length)),
      ),
  );
  setIsStreaming(false);
  break;
```

Note: the filter now keeps assistant messages that have tool calls even if content is empty (edge case where agent calls tools but produces no text).

- [ ] **Step 2: Verify the thinking-orb CSS supports the small variant**

The `ToolCallBlock` uses `!w-3 !h-3` on the orb for the spinner. Check that `globals.css` `.thinking-orb` doesn't have a fixed width/height that would fight this. If it does, ensure the orb's base size is set via width/height utilities not in the CSS class.

- [ ] **Step 3: Commit**

```bash
git add client/hooks/use-chat.ts client/app/globals.css
git commit -m "fix: clean up end handler, preserve tool-call-only messages"
```
