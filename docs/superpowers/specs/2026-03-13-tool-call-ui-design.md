# Tool Call UI & Streaming Status Redesign

## Problem

1. Tool calls are invisible — `tool_call` sets a status label that gets wiped on first stream delta, `tool_result` is a no-op
2. The thinking orb disappears mid-stream because it's gated on `statusMessage && !content`
3. `isStreaming` is tracked but never rendered — no loading indicator after orb vanishes
4. Status text just overwrites itself with no persistence of what happened

## Design

### Data Model

Add `toolCalls` to `ChatMessage` in `use-chat.ts`:

```ts
interface ToolCallEntry {
  name: string;       // raw tool name: "recall_memory"
  label: string;      // friendly: "Rummaging..."
  status: "running" | "done";
  result?: string;    // truncated output from tool_result event
}

export interface ChatMessage {
  // ... existing fields
  toolCalls?: ToolCallEntry[];
}
```

No backend changes needed — existing SSE events provide all data.

### Event Handling (`use-chat.ts`)

| Event | New behavior |
|-------|-------------|
| `status` | Set `statusMessage` on AI msg (pre-agent loading steps) |
| `tool_call` | Append `{ name, label, status: "running" }` to `toolCalls[]`, clear `statusMessage` |
| `tool_result` | Find matching running tool call, set `status: "done"` and `result` |
| `stream` | Append content only (remove `clearStatus` call) |
| `end` | Filter empty assistant msgs (unchanged) |

### Orb Logic (`chat-message.tsx`)

Old: `showOrb = statusMessage && !content`
New: `showOrb = !!statusMessage` — shows during pre-agent steps, clears naturally when first `tool_call` arrives (which clears `statusMessage`).

### Tool Call UI (`chat-message.tsx`)

Render tool call blocks above `<Streamdown>` content. Each block:
- Compact row: spinner (running) or checkmark (done) + friendly label
- Clickable to expand/collapse the result text
- Collapsed by default, subtle styling

### Files Changed

1. `client/hooks/use-chat.ts` — add `toolCalls` to ChatMessage, update event handlers
2. `client/components/chat-message.tsx` — render tool call blocks, fix orb logic
3. `client/lib/trail-labels.ts` — no changes, already has labels
4. `client/app/globals.css` — minimal styles for tool call blocks if needed
