"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  status: "running" | "done";
  result?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type?: "text" | "plan_card" | "phase_divider";
  metadata?: { topicSlug?: string };
  statusMessage?: string;
  toolCalls?: ToolCallEntry[];
}

interface UseChatOptions {
  threadId?: string | null;
  onThreadCreated?: (threadId: string) => void;
  onPlanCreated?: (topicSlug: string) => void;
}

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
  feynmanOpen: boolean;
  feynmanConcept: string | null;
  dismissFeynman: () => void;
}

export function useChat({
  threadId: initialThreadId = null,
  onThreadCreated,
  onPlanCreated,
}: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessageLoading] = useState<boolean>(true);
  const [phase, setPhase] = useState("interview");
  const [isStreaming, setIsStreaming] = useState(false);
  // Only used when no initialThreadId — stores the ID after creating a new thread
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const threadId = initialThreadId ?? createdThreadId;

  const [interviewQuestions, setInterviewQuestions] = useState<
    InterviewQuestion[] | null
  >(null);
  const msgCounter = useRef(0);
  const pendingInterviewRef = useRef<InterviewQuestion[] | null>(null);
  const [feynmanOpen, setFeynmanOpen] = useState(false);
  const [feynmanConcept, setFeynmanConcept] = useState<string | null>(null);
  const pendingFeynmanRef = useRef<string | null>(null);

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
    mutationFn: createThread,
  });

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMsgId = `msg-${++msgCounter.current}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content },
      ]);
      setIsStreaming(true);
      setInterviewQuestions(null);
      pendingInterviewRef.current = null;

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
        { id: aiMsgId, role: "assistant", content: "", statusMessage: "", toolCalls: [] },
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
                        { name: event.name, label: getTrailLabel("tool_call", event.name), status: "running" as const },
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
            setMessages((prev) =>
              prev.map((m) =>
                m.id === currentAiMsgId
                  ? { ...m, content: m.content + event.content, statusMessage: undefined }
                  : m,
              ),
            );
            break;
          case "phase":
            setPhase(event.phase);
            break;
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
          case "interview_questions":
            clearStatus();
            pendingInterviewRef.current = event.questions;
            setInterviewQuestions(event.questions);
            break;
          case "feynman_prompt":
            // Store in a ref and apply after "end" event, same pattern as pendingInterviewRef.
            // This prevents opening the modal while streaming is still in progress.
            pendingFeynmanRef.current = event.concept_name;
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
          case "end":
            if (event.duration_ms) {
              console.log(`[chat] total — ${event.duration_ms}ms`);
            }
            setMessages((prev) =>
              prev
                .map((m) =>
                  m.id === currentAiMsgId ? { ...m, statusMessage: undefined } : m,
                )
                .filter(
                  (m) =>
                    !(m.role === "assistant" && m.content === "" && !(m.toolCalls?.length)),
                ),
            );
            setIsStreaming(false);
            // Apply pending Feynman prompt after streaming ends
            if (pendingFeynmanRef.current) {
              setFeynmanOpen(true);
              setFeynmanConcept(pendingFeynmanRef.current);
              pendingFeynmanRef.current = null;
            }
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

      setIsStreaming(false);

      // Ref-based fallback: if the SSE event set interview questions during
      // streaming but React's batching swallowed the state update, apply it now.
      if (pendingInterviewRef.current) {
        setInterviewQuestions(pendingInterviewRef.current);
        pendingInterviewRef.current = null;
      }
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

  const dismissFeynman = useCallback(() => {
    setFeynmanOpen(false);
    setFeynmanConcept(null);
  }, []);

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
    feynmanOpen,
    feynmanConcept,
    dismissFeynman,
  };
}
