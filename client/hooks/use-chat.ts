"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createThread,
  streamChat,
  getMessages,
  type SSEEvent,
  type InterviewQuestion,
} from "@/lib/api";
import { getTrailLabel } from "@/lib/trail-labels";

export interface ToolCallEntry {
  name: string;
  label: string;
  doneLabel: string;
  status: "running" | "done";
  result?: string;
}

export interface BranchSuggestion {
  topic: string;
  reason: string;
  messageId: string;
}

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

interface UseChatOptions {
  threadId?: string | null;
  agent?: string;
  onThreadCreated?: (threadId: string) => void;
  onPlanCreated?: (topicSlug: string) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isMessagesLoading: boolean;
  phase: string;
  isStreaming: boolean;
  isLoading: boolean;
  threadId: string | null;
  interviewQuestions: InterviewQuestion[] | null;
  send: (content: string) => Promise<void>;
  submitInterviewAnswers: (answers: Record<number, string>) => Promise<void>;
  dismissInterview: () => void;
  feynmanOpen: boolean;
  feynmanConcept: string | null;
  openFeynman: (concept: string) => void;
  dismissFeynman: () => void;
  branchSuggestion: BranchSuggestion | null;
  dismissBranchSuggestion: () => void;
  phaseComplete: { phaseTitle: string; isFinalPhase: boolean; nextPhaseTitle: string } | null;
  dismissPhaseComplete: () => void;
}

export function useChat({
  threadId: initialThreadId = null,
  agent: agentType,
  onThreadCreated,
  onPlanCreated,
}: UseChatOptions = {}): UseChatReturn {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessageLoading] = useState<boolean>(true);
  const [phase, setPhase] = useState("interview");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const threadId = initialThreadId ?? createdThreadId;

  const [interviewQuestions, setInterviewQuestions] = useState<
    InterviewQuestion[] | null
  >(null);
  const msgCounter = useRef(0);
  const [feynmanOpen, setFeynmanOpen] = useState(false);
  const [feynmanConcept, setFeynmanConcept] = useState<string | null>(null);
  const [branchSuggestion, setBranchSuggestion] =
    useState<BranchSuggestion | null>(null);
  const [phaseComplete, setPhaseComplete] = useState<{
    phaseTitle: string;
    isFinalPhase: boolean;
    nextPhaseTitle: string;
  } | null>(null);

  // Load existing messages when threadId is provided
  useQuery({
    queryKey: ["messages", threadId],
    queryFn: async () => {
      setMessageLoading(true);
      const { messages: existing } = await getMessages(threadId!);
      let pendingInterview: InterviewQuestion[] | null = null;
      let hasAnswerAfterInterview = false;

      const mapped = existing.map((m, idx) => {
        if (m.type === "plan_card") {
          let topicSlug = "";
          try {
            topicSlug = JSON.parse(m.content).topic_slug ?? "";
          } catch {
            /* ignore */
          }
          return {
            id: m.id,
            role: "system" as const,
            content: "",
            type: "plan_card" as const,
            metadata: { topicSlug },
          };
        }
        if (m.type === "interview_questions") {
          try {
            pendingInterview = JSON.parse(m.content) as InterviewQuestion[];
          } catch {
            /* ignore */
          }
          const later = existing.slice(idx + 1);
          hasAnswerAfterInterview = later.some(
            (l) =>
              l.role === "user" && l.content.startsWith("[Interview Answers]"),
          );
          return {
            id: m.id,
            role: "system" as const,
            content: "",
            type: "text" as const,
          };
        }
        if (m.type === "notification") {
          const meta = (m as any).metadata;
          return {
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            type: "notification" as const,
            metadata: {
              notificationType: meta?.notification_type ?? "stale_topic",
              topicSlug: meta?.topic_slug ?? "",
              conceptName: meta?.concept_name ?? "",
            },
          };
        }
        return {
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        };
      });

      setMessages(mapped);
      setMessageLoading(false);

      if (pendingInterview && !hasAnswerAfterInterview) {
        setInterviewQuestions(pendingInterview);
      }

      return existing;
    },
    enabled: !!initialThreadId,
    staleTime: 0,
  });

  const createThreadMutation = useMutation({
    mutationFn: (content: string) => createThread(content, agentType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thread-tree"] });
    },
  });

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMsgId = `msg-${++msgCounter.current}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content },
      ]);
      setIsLoading(true);
      setInterviewQuestions(null);
      setBranchSuggestion(null);

      let currentThreadId = initialThreadId ?? createdThreadId;
      if (!currentThreadId) {
        const { thread_id } = await createThreadMutation.mutateAsync(content);
        currentThreadId = thread_id;
        setCreatedThreadId(thread_id);
        onThreadCreated?.(thread_id);
      }

      const aiMsgId = `msg-${++msgCounter.current}`;
      let currentUserMsgId = userMsgId;
      let currentAiMsgId = aiMsgId;
      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          role: "assistant",
          content: "",
          statusMessage: "",
          toolCalls: [],
        },
      ]);

      const setStatus = (label: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentAiMsgId ? { ...m, statusMessage: label } : m,
          ),
        );
      };

      const clearStatus = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentAiMsgId ? { ...m, statusMessage: undefined } : m,
          ),
        );
      };

      await streamChat(currentThreadId, content, (event: SSEEvent) => {
        console.log({ event });
        switch (event.type) {
          case "status":
            setStatus(getTrailLabel("status", event.step));
            console.log(`[chat] ${event.step} — ${event.duration_ms}ms`);
            break;
          case "tool_call":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === currentAiMsgId
                  ? {
                      ...m,
                      statusMessage: undefined,
                      toolCalls: [
                        ...(m.toolCalls ?? []),
                        {
                          name: event.name,
                          label: getTrailLabel("tool_call", event.name),
                          doneLabel: getTrailLabel("tool_call_done", event.name),
                          status: "running" as const,
                        },
                      ],
                    }
                  : m,
              ),
            );
            break;
          case "tool_result":
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
          case "message_id": {
            const isUser = event.role === "user";
            const tempId = isUser ? currentUserMsgId : currentAiMsgId;
            if (isUser) currentUserMsgId = event.message_id;
            else currentAiMsgId = event.message_id;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, id: event.message_id } : m,
              ),
            );
            break;
          }
          case "stream":
            setIsStreaming(true);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === currentAiMsgId
                  ? {
                      ...m,
                      content: m.content + event.content,
                      statusMessage: undefined,
                    }
                  : m,
              ),
            );
            break;
          case "phase":
            setPhase(event.phase);
            break;
          case "phase_change":
            setPhase(event.to);
            queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
            queryClient.invalidateQueries({ queryKey: ["threads"] });
            queryClient.invalidateQueries({ queryKey: ["thread-tree"] });
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
          case "interview_questions":
            clearStatus();
            setInterviewQuestions(event.questions);
            break;
          case "feynman_prompt":
            setFeynmanOpen(true);
            setFeynmanConcept(event.concept_name);
            break;
          case "branch_suggestion":
            setBranchSuggestion({
              topic: event.topic,
              reason: event.reason,
              messageId: currentAiMsgId,
            });
            break;
          case "phase_complete":
            setPhaseComplete({
              phaseTitle: event.phase_title,
              isFinalPhase: event.is_final_phase,
              nextPhaseTitle: event.next_phase_title,
            });
            break;
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
          case "title_update":
            queryClient.invalidateQueries({ queryKey: ["threads"] });
            queryClient.invalidateQueries({ queryKey: ["thread-tree"] });
            break;
          case "end":
            if (event.duration_ms) {
              console.log(`[chat] total — ${event.duration_ms}ms`);
            }
            setMessages((prev) =>
              prev
                .map((m) =>
                  m.id === currentAiMsgId
                    ? { ...m, statusMessage: undefined }
                    : m,
                )
                .filter(
                  (m) =>
                    !(
                      m.role === "assistant" &&
                      m.content === "" &&
                      !m.toolCalls?.length
                    ),
                ),
            );
            setIsStreaming(false);
            break;
          case "error":
            clearStatus();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === currentAiMsgId
                  ? { ...m, content: m.content || event.content }
                  : m,
              ),
            );
            setIsStreaming(false);
            break;
        }
      });

      setIsLoading(false);
      setIsStreaming(false);
    },
    [
      initialThreadId,
      createdThreadId,
      isStreaming,
      createThreadMutation,
      onThreadCreated,
      onPlanCreated,
    ],
  );

  const submitInterviewAnswers = useCallback(
    async (answers: Record<number, string>) => {
      if (!interviewQuestions) return;
      const lines = interviewQuestions.map(
        (q, i) => `${i + 1}. ${q.question} → ${answers[i] ?? "(skipped)"}`,
      );
      const formatted = `[Interview Answers]\n${lines.join("\n")}`;
      setInterviewQuestions(null);
      await send(formatted);
    },
    [interviewQuestions, send],
  );

  const dismissInterview = useCallback(() => {
    setInterviewQuestions(null);
  }, []);

  const openFeynman = useCallback((concept: string) => {
    setFeynmanOpen(true);
    setFeynmanConcept(concept);
  }, []);

  const dismissFeynman = useCallback(() => {
    setFeynmanOpen(false);
    setFeynmanConcept(null);
  }, []);

  const dismissBranchSuggestion = useCallback(() => {
    setBranchSuggestion(null);
  }, []);

  const dismissPhaseComplete = useCallback(() => {
    setPhaseComplete(null);
  }, []);

  return {
    messages,
    isMessagesLoading: messagesLoading,
    phase,
    isStreaming,
    isLoading,
    threadId,
    interviewQuestions,
    send,
    submitInterviewAnswers,
    dismissInterview,
    feynmanOpen,
    feynmanConcept,
    openFeynman,
    dismissFeynman,
    branchSuggestion,
    dismissBranchSuggestion,
    phaseComplete,
    dismissPhaseComplete,
  };
}
