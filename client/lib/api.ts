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
  | { type: "title_update"; title: string }
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

// ── Study Topics ─────────────────────────────────────────────────────────

export interface StudyTopicThread {
  id: string;
  title: string;
  updated_at: string;
}

export interface StudyTopic {
  root_thread_id: string;
  topic: string;
  topic_slug: string;
  current_concept: string | null;
  progress: number;
  phase: string;
  latest_thread: StudyTopicThread;
}

export async function getStudyTopics(limit?: number): Promise<{ topics: StudyTopic[] }> {
  const params = limit != null ? `?limit=${limit}` : "";
  const res = await fetch(`${API_BASE}/threads/study-topics${params}`);
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

// ── Ebbinghaus (Testing Agent) ───────────────────────────────────────────

export interface EbbinghausQuestion {
  id: string;
  type:
    | "mcq_single"
    | "mcq_multi"
    | "freeform"
    | "cloze"
    | "teach_back"
    | "scenario";
  question: string;
  options: string[] | null;
  explanation_hint: string | null;
}

export interface GenerateTestResponse {
  test_id: string;
  concept_name: string;
  questions: EbbinghausQuestion[];
  error?: string;
  message?: string;
}

export interface QuestionFeedback {
  question_id: string;
  correct: boolean;
  score: number;
  feedback: string;
}

export interface TestSubmitResponse {
  test_id: string;
  overall_score: number;
  scores: {
    clarity: number;
    accuracy: number;
    depth: number;
    transferability: number;
  };
  per_question: QuestionFeedback[];
  feedback: string;
  weak_areas: string[];
  mastery_update: {
    previous_score: number;
    new_score: number;
    tier: string;
    next_review: string;
  };
}

export interface PendingTest {
  id: string;
  concept_name: string;
  topic_slug: string;
  scheduled_for: string;
  status: string;
  mastery_score: number;
  mastery_tier: string;
}

export interface TestableTopicConcept {
  name: string;
  mastery_score: number | null;
  mastery_tier: string | null;
}

export interface TestableTopic {
  topic_slug: string;
  topic_name: string;
  concepts: TestableTopicConcept[];
}

export async function getPendingTests(): Promise<{ tests: PendingTest[] }> {
  const res = await fetch(`${API_BASE}/ebbinghaus/pending`);
  if (!res.ok) throw new Error("Failed to fetch pending tests");
  return res.json();
}

export async function getTestableTopics(): Promise<{
  topics: TestableTopic[];
}> {
  const res = await fetch(`${API_BASE}/ebbinghaus/topics`);
  if (!res.ok) throw new Error("Failed to fetch testable topics");
  return res.json();
}

export async function generateTest(
  conceptName: string,
  topicSlug: string,
): Promise<GenerateTestResponse> {
  const res = await fetch(`${API_BASE}/ebbinghaus/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concept_name: conceptName,
      topic_slug: topicSlug,
    }),
  });
  if (!res.ok) throw new Error("Failed to generate test");
  return res.json();
}

export async function submitTest(
  testId: string,
  answers: { question_id: string; answer: string }[],
): Promise<TestSubmitResponse> {
  const res = await fetch(`${API_BASE}/ebbinghaus/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test_id: testId, answers }),
  });
  if (!res.ok) throw new Error("Failed to submit test");
  return res.json();
}

export async function getTestHistory(): Promise<{
  results: {
    id: string;
    concept_name: string;
    topic_slug: string;
    overall_score: number;
    feedback: string;
    created_at: string;
  }[];
}> {
  const res = await fetch(`${API_BASE}/ebbinghaus/history`);
  if (!res.ok) throw new Error("Failed to fetch test history");
  return res.json();
}

// ── Graph Views ──────────────────────────────────────────────────────────

export interface ThreadMapNode {
  thread_id: string;
  title: string;
  phase: string;
  depth: number;
  current_concept: string | null;
  summary: string | null;
  status: string;
  progress: number | null;
}

export interface ThreadMapEdge {
  source: string;
  target: string;
  source_concept: string | null;
  branch_topic: string | null;
}

export interface ThreadMapData {
  nodes: ThreadMapNode[];
  edges: ThreadMapEdge[];
}

export async function fetchThreadMap(threadId: string): Promise<ThreadMapData> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/map`);
  if (!res.ok) throw new Error(`Failed to fetch thread map: ${res.status}`);
  return res.json();
}

export interface KnowledgeConcept {
  name: string;
  mastery_score: number;
  strength_trend: "improving" | "stable" | "declining";
  threads: string[];
  last_reviewed: string | null;
  domain: string;
  source: "plan" | "extracted" | "prerequisite";
  confidence: number;
  description: string;
  weak_subconcepts: string[];
  node_type?: "concept" | "topic_hub" | "memory_hub" | "thread";
  display_name?: string;
  concept_count?: number;
  thread_phase?: string;
  thread_status?: string;
  thread_depth?: number;
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  type: "prerequisite_of" | "part_of" | "explored_from" | "confused_with";
  weight: number;
}

export interface GraphStats {
  total_concepts: number;
  mastered: number;
  in_progress: number;
  undiscovered: number;
  domain_count: number;
  edge_count: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeConcept[];
  edges: KnowledgeEdge[];
  domains: string[];
  stats: GraphStats;
}

export async function fetchKnowledgeGraph(domain?: string): Promise<KnowledgeGraphData> {
  const params = new URLSearchParams();
  if (domain) params.set("domain", domain);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/knowledge-graph${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`Failed to fetch knowledge graph: ${res.status}`);
  return res.json();
}
