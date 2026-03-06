"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  createThread,
  streamChat,
  getMessages,
  type SSEEvent,
} from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface UseChatOptions {
  threadId?: string | null;
}

interface UseChatReturn {
  messages: ChatMessage[];
  phase: string;
  isStreaming: boolean;
  isWaiting: boolean;
  threadId: string | null;
  send: (content: string) => Promise<void>;
}

export function useChat({
  threadId: initialThreadId = null,
}: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState("interview");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const msgCounter = useRef(0);
  const waitingCleared = useRef(false);

  // Load existing messages when threadId is provided
  useQuery({
    queryKey: ["messages", threadId],
    queryFn: async () => {
      const { messages: existing } = await getMessages(threadId!);
      setMessages(
        existing.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      );
      return existing;
    },
    enabled: !!threadId,
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

      let currentThreadId = threadId;
      if (!currentThreadId) {
        const { thread_id } = await createThreadMutation.mutateAsync(content);
        currentThreadId = thread_id;
        setThreadId(thread_id);
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
          case "end":
            setIsStreaming(false);
            break;
          case "error":
            setIsStreaming(false);
            break;
        }
      });

      setIsStreaming(false);
    },
    [threadId, isStreaming, createThreadMutation],
  );

  return { messages, phase, isStreaming, isWaiting, threadId, send };
}
