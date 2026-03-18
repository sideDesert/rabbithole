"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  triggerNotify,
  getNotificationMessages,
} from "@/lib/api-notify";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const LS_KEY_PREFIX = "ebbinghaus-last-seen-";

function getLastSeenId(threadId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${LS_KEY_PREFIX}${threadId}`);
}

function setLastSeenId(threadId: string, messageId: string) {
  localStorage.setItem(`${LS_KEY_PREFIX}${threadId}`, messageId);
}

export function useEbbinghausNotifications() {
  // Counter to force re-derive after markAsRead writes to localStorage
  const [, setVersion] = useState(0);

  // Poll the notify endpoint
  const { data: notifyData, isLoading } = useQuery({
    queryKey: ["ebbinghaus-notify"],
    queryFn: triggerNotify,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: false,
  });

  const notificationThreadId = notifyData?.thread_id ?? null;

  // Fetch messages to compute unread count
  const { data: messages } = useQuery({
    queryKey: ["ebbinghaus-notification-messages", notificationThreadId],
    queryFn: () => getNotificationMessages(notificationThreadId!),
    enabled: !!notificationThreadId,
    refetchInterval: POLL_INTERVAL,
  });

  // Derive unread count directly from messages + localStorage
  const unreadCount = (() => {
    if (!messages || !notificationThreadId) return 0;
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    if (assistantMessages.length === 0) return 0;
    const lastSeenId = getLastSeenId(notificationThreadId);
    if (!lastSeenId) return assistantMessages.length;
    const lastSeenIdx = assistantMessages.findIndex((m) => m.id === lastSeenId);
    if (lastSeenIdx === -1) return assistantMessages.length;
    return assistantMessages.length - lastSeenIdx - 1;
  })();

  function markAsRead() {
    if (!messages || !notificationThreadId) return;
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const last = assistantMessages[assistantMessages.length - 1];
    if (last) {
      setLastSeenId(notificationThreadId, last._id);
      setVersion((v) => v + 1); // trigger re-render to re-derive unreadCount
    }
  }

  return {
    unreadCount,
    notificationThreadId,
    isLoading,
    markAsRead,
  };
}
