/**
 * API client for the Rabbithole backend.
 * Simple fetch-based client with SSE streaming support.
 */

const API_BASE = "http://localhost:8000/api";

// ── Types ────────────────────────────────────────────────────────────────

export interface InterviewQuestion {
  question: string;
  options: string[];
}

export type SSEEvent =
  | { type: "phase"; phase: string }
  | { type: "stream"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: Record<string, unknown> }
  | { type: "phase_change"; from: string; to: string }
  | { type: "plan_created"; topic_slug: string }
  | { type: "interview_questions"; questions: InterviewQuestion[] }
  | { type: "end" }
  | { type: "error"; content: string };

export interface Thread {
  created_at: string;
  updated_at: string;
  user_id: string;
  title: string;
  topic_slug: string;
  summary: string | null;
  status: string;
  depth: number;
  parent_thread_id: string | null;
  root_thread_id: string | null;
  branch_point_id: string | null;
  agent: string;
  evermemos_group_id: string;
  closed_at: string | null;
  pending_test: string | null;
  phase: string;
  interview_context: unknown;
  current_concept: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type: string;
}

// ── Thread APIs ──────────────────────────────────────────────────────────

export async function createThread(
  content: string,
): Promise<{ thread_id: string; phase: string }> {
  const res = await fetch(`${API_BASE}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

export async function listThreads(): Promise<{ threads: Thread[] }> {
  const res = await fetch(`${API_BASE}/threads`);
  return res.json();
}

export async function deleteThread(threadId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function getThread(threadId: string): Promise<Thread> {
  const res = await fetch(`${API_BASE}/threads/${threadId}`);
  return res.json();
}

export async function getMessages(
  threadId: string,
): Promise<{ messages: Message[] }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/messages`);
  return res.json();
}

// ── Plan ──────────────────────────────────────────────────────────────────

export interface PlanConcept {
  name: string;
  description: string;
  completed: boolean;
  order: number;
}

export interface PlanPhase {
  title: string;
  order: number;
  progress: number;
  concepts: PlanConcept[];
}

export interface PlanProgress {
  topic: string;
  depth: string;
  prior_knowledge: string;
  overall_progress: number;
  current_concept: string | null;
  phases: PlanPhase[];
}

export async function getPlan(
  threadId: string,
): Promise<{ markdown: string | null; topic_slug: string | null }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/plan`);
  return res.json();
}

export async function getProgress(threadId: string): Promise<PlanProgress> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/progress`);
  return res.json();
}

export async function toggleConcept(
  threadId: string,
  conceptName: string,
  completed: boolean,
): Promise<{ toggled: boolean; overall_progress: number }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/plan/toggle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept_name: conceptName, completed }),
  });
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
