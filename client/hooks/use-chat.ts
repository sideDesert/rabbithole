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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type?: "text" | "plan_card";
  metadata?: { topicSlug?: string };
}

interface UseChatOptions {
  threadId?: string | null;
  onThreadCreated?: (threadId: string) => void;
  onPlanCreated?: (topicSlug: string) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  phase: string;
  isStreaming: boolean;
  isWaiting: boolean;
  threadId: string | null;
  interviewQuestions: InterviewQuestion[] | null;
  send: (content: string) => Promise<void>;
  submitInterviewAnswers: (answers: Record<number, string>) => Promise<void>;
  dismissInterview: () => void;
}

export function useChat({
  threadId: initialThreadId = null,
  onThreadCreated,
  onPlanCreated,
}: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState("interview");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [interviewQuestions, setInterviewQuestions] = useState<
    InterviewQuestion[] | null
  >(null);
  const msgCounter = useRef(0);
  const waitingCleared = useRef(false);
  const pendingInterviewRef = useRef<InterviewQuestion[] | null>(null);

  // Load existing messages when threadId is provided
  useQuery({
    queryKey: ["messages", threadId],
    queryFn: async () => {
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

      if (pendingInterview && !hasAnswerAfterInterview) {
        setInterviewQuestions(pendingInterview);
      }

      return existing;
    },
    enabled: !!initialThreadId,
    staleTime: Infinity,
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
      setIsWaiting(true);
      waitingCleared.current = false;
      pendingInterviewRef.current = null;

      let currentThreadId = threadId;
      if (!currentThreadId) {
        const { thread_id } = await createThreadMutation.mutateAsync(content);
        currentThreadId = thread_id;
        setThreadId(thread_id);
        onThreadCreated?.(thread_id);
      }

      const aiMsgId = `msg-${++msgCounter.current}`;
      setMessages((prev) => [
        ...prev,
        { id: aiMsgId, role: "assistant", content: "" },
      ]);

      await streamChat(currentThreadId, content, (event: SSEEvent) => {
        switch (event.type) {
          case "stream":
            if (!waitingCleared.current) {
              waitingCleared.current = true;
              setIsWaiting(false);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: m.content + event.content }
                  : m,
              ),
            );
            break;
          case "phase":
            setPhase(event.phase);
            break;
          case "phase_change":
            setPhase(event.to);
            break;
          case "interview_questions":
            pendingInterviewRef.current = event.questions;
            setInterviewQuestions(event.questions);
            break;
          case "plan_created": {
            const slug = event.topic_slug;
            setMessages((prev) => [
              ...prev,
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
            setIsStreaming(false);
            break;
          case "error":
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
    [threadId, isStreaming, createThreadMutation, onThreadCreated, onPlanCreated],
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

  return {
    messages,
    phase,
    isStreaming,
    isWaiting,
    threadId,
    interviewQuestions,
    send,
    submitInterviewAnswers,
    dismissInterview,
  };
}
