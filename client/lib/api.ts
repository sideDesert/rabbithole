/**
 * API client for the Rabbithole backend.
 * Simple fetch-based client with SSE streaming support.
 */

const API_BASE = "http://localhost:8000/api";

// ── Types ────────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: "phase"; phase: string }
  | { type: "stream"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: Record<string, unknown> }
  | { type: "phase_change"; from: string; to: string }
  | { type: "end" }
  | { type: "error"; content: string };

export interface Thread {
  id: string;
  title: string;
  phase: string;
  topic_slug: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type: string;
}

// ── Thread APIs ──────────────────────────────────────────────────────────

export async function createThread(content: string): Promise<{ thread_id: string; phase: string }> {
  const res = await fetch(`${API_BASE}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

export async function getThread(threadId: string): Promise<Thread> {
  const res = await fetch(`${API_BASE}/threads/${threadId}`);
  return res.json();
}

export async function getMessages(threadId: string): Promise<{ messages: Message[] }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/messages`);
  return res.json();
}

// ── SSE Chat ─────────────────────────────────────────────────────────────

export async function streamChat(
  threadId: string,
  content: string,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/${threadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok || !res.body) {
    onEvent({ type: "error", content: "Failed to connect" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as SSEEvent;
          onEvent(event);
        } catch {
          // skip malformed events
        }
      }
    }
  }
}
