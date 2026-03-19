const API_BASE = "http://localhost:8000/api";

export interface NotifyResponse {
  notified: boolean;
  thread_id: string | null;
}

export interface NotificationMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  type: string;
  metadata?: {
    notification_type: "overdue_review" | "stale_topic";
    topic_slug: string;
    concept_name: string;
  };
}

export async function triggerNotify(): Promise<NotifyResponse> {
  const res = await fetch(`${API_BASE}/ebbinghaus/notify`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Notify request failed");
  return res.json();
}

export async function getNotificationMessages(
  threadId: string,
): Promise<NotificationMessage[]> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/messages`);
  if (!res.ok) throw new Error("Failed to fetch notification messages");
  const data = await res.json();
  return data.messages ?? [];
}
