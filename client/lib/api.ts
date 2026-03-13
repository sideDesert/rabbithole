/**
 * API client for the Rabbithole backend.
 * Simple fetch-based client with SSE streaming support.
 */

import { PHASE_TYPE } from "next/dist/shared/lib/constants";

const API_BASE = "http://localhost:8000/api";

// ── Types ────────────────────────────────────────────────────────────────

export interface InterviewQuestion {
  question: string;
  options: string[];
}

export type SSEEvent =
  | { type: "phase"; phase: string }
  | { type: "status"; step: string; message: string; duration_ms: number }
  | { type: "stream"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "phase_change"; from: string; to: string }
  | { type: "plan_created"; topic_slug: string }
  | { type: "interview_questions"; questions: InterviewQuestion[] }
  | { type: "feynman_prompt"; concept_name: string }
  | { type: "message_id"; role: "user" | "assistant"; message_id: string }
  | { type: "end"; duration_ms?: number }
  | { type: "error"; content: string };

export interface Thread {
  id: string;
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
  branch_source_message_id: string | null;
  agent: string;
  evermemos_group_id: string;
  closed_at: string | null;
  pending_test: string | null;
  phase: string;
  interview_context: unknown;
  current_concept: string | null;
  parent_summary: string | null;
  branch_text: string | null;
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

export async function deleteThread(
  threadId: string,
): Promise<{ deleted: boolean }> {
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

// ── Thread Tree ──────────────────────────────────────────────────────────

export interface ThreadTreeNode {
  thread_id: string;
  title: string;
  status: string;
  phase: string;
  depth: number;
  updated_at: string;
  children: ThreadTreeNode[];
}

export async function fetchThreadTrees(): Promise<{
  trees: ThreadTreeNode[];
}> {
  const res = await fetch(`${API_BASE}/threads/tree`);
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

export type BranchoutResponse = {
  thread_id: string;
  branch_point_id: string;
  title: string;
  phase: PHASE_TYPE;
  parent_summary: string;
};

export type BranchoutParams = {
  messageId: string;
  threadId: string;
  branchText: string;
  textPosition?: number[];
  title?: string;
};

export async function branchout(
  params: BranchoutParams,
): Promise<BranchoutResponse> {
  const body = {
    message_id: params.messageId,
    branch_type: "highlight",
    branch_text: params.branchText,
    position_start:
      params.textPosition && params.textPosition.length > 1
        ? params.textPosition[0]
        : null,
    position_end:
      params.textPosition && params.textPosition.length > 1
        ? params.textPosition[1]
        : null,
    title: params.title,
  };

  const res = await fetch(`${API_BASE}/threads/${params.threadId}/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json();
}

// ── Branches ─────────────────────────────────────────────────────────────

export interface Branch {
  branch_point_id: string;
  thread_id: string;
  message_id: string;
  position: { start: number; end: number } | null;
  type: string;
  title: string;
  status: string;
  phase: string;
  depth: number;
}

export async function listBranches(
  threadId: string,
): Promise<{ branches: Branch[] }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/branches`);
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

// ── Feynman Mode ────────────────────────────────────────────────────

export interface HintResponse {
  hint: string;
  hint_id: string;
}

export async function requestFeynmanHint(
  threadId: string,
  conceptName: string,
  currentContent?: string,
): Promise<HintResponse> {
  const res = await fetch(`${API_BASE}/feynman/hint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      concept_name: conceptName,
      current_content: currentContent || null,
    }),
  });
  if (!res.ok) throw new Error("Failed to get hint");
  return res.json();
}

export interface SubmitFeynmanResponse {
  submission_id: string;
  status: string;
}

export async function submitFeynmanExplanation(
  threadId: string,
  conceptName: string,
  markdown: string,
  hintIds: string[],
): Promise<SubmitFeynmanResponse> {
  const res = await fetch(`${API_BASE}/feynman/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      concept_name: conceptName,
      markdown,
      hint_ids: hintIds,
    }),
  });
  if (!res.ok) throw new Error("Failed to submit explanation");
  return res.json();
}
