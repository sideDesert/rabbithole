"use client";

import { useState, useCallback, useRef } from "react";
import { createThread, streamChat, getMessages, type SSEEvent, type Message } from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  phase: string;
  isStreaming: boolean;
  threadId: string | null;
  send: (content: string) => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState("interview");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const msgCounter = useRef(0);

  const send = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    // Add user message
    const userMsgId = `msg-${++msgCounter.current}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content }]);
    setIsStreaming(true);

    // Create thread if needed
    let currentThreadId = threadId;
    if (!currentThreadId) {
      const { thread_id } = await createThread(content);
      currentThreadId = thread_id;
      setThreadId(thread_id);
    }

    // Add empty assistant message for streaming
    const aiMsgId = `msg-${++msgCounter.current}`;
    setMessages((prev) => [...prev, { id: aiMsgId, role: "assistant", content: "" }]);

    // Stream response
    await streamChat(currentThreadId, content, (event: SSEEvent) => {
      switch (event.type) {
        case "stream":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: m.content + event.content } : m,
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
  }, [threadId, isStreaming]);

  return { messages, phase, isStreaming, threadId, send };
}
