"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, GraduationCap, ClipboardCheck } from "lucide-react";
import { useStudyTopics } from "@/hooks/use-study-topics";
import { Button } from "./ui/button";

interface NotificationActionCardProps {
  notificationType?: "overdue_review" | "stale_topic";
  topicSlug?: string;
}

export function NotificationActionCard({
  notificationType,
  topicSlug,
}: NotificationActionCardProps) {
  const router = useRouter();
  const { topics } = useStudyTopics();
  const topic = topicSlug
    ? topics.find((t) => t.topic_slug === topicSlug)
    : null;

  const threadId = topic?.latest_thread.id;

  // No matching topic — nothing actionable to link to
  if (!threadId) return null;

  if (notificationType === "overdue_review") {
    return (
      <Button
        onClick={() => router.push(`/threads/${threadId}`)}
        className="inline-flex items-center gap-1.5 border-2 border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground neo-hover transition-colors cursor-pointer"
      >
        <ClipboardCheck className="size-3" />
        Take Test
        <ArrowRight className="size-3" />
      </Button>
    );
  }

  return (
    <Button
      onClick={() => router.push(`/threads/${threadId}`)}
      className="inline-flex items-center gap-1.5 border-2 border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground neo-hover transition-colors cursor-pointer"
    >
      <GraduationCap className="size-3" />
      Continue Learning
      <ArrowRight className="size-3" />
    </Button>
  );
}
