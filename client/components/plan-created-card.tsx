"use client";

import { useRouter } from "next/navigation";
import {
  ChecklistBoldDuotone,
  ArrowRightBoldDuotone,
  CourseUpBoldDuotone,
  PlayBoldDuotone,
} from "solar-icon-set";
import { usePlan } from "./plan-context";
import { useStudyTopics } from "@/hooks/use-study-topics";
import { useState } from "react";

interface PlanCreatedCardProps {
  topicSlug: string;
  onStart?: () => Promise<void>;
}

function formatTitle(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PlanCreatedCard({ topicSlug, onStart }: PlanCreatedCardProps) {
  const { setActiveTab } = usePlan();
  const { topics } = useStudyTopics();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const topic = topics.find((t) => t.topic_slug === topicSlug);
  // "Started" means child threads exist (user clicked Start Learning),
  // NOT just progress > 0 (concept extractor can bump progress during interview)
  const hasStarted =
    topic && topic.latest_thread.id !== topic.root_thread_id;
  const percent = topic ? Math.round(topic.progress * 100) : 0;

  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!onStart) return;
    setLoading(true);
    setError(null);
    try {
      await onStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start learning");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-2 border-border rounded-lg shadow-md p-4 bg-card max-w-sm card-hover">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-primary/10">
          <ChecklistBoldDuotone className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {hasStarted ? "Learning in progress" : "Learning plan created"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {formatTitle(topicSlug)}
          </p>
        </div>
      </div>
      {hasStarted && (
        <div className="mt-3 space-y-1.5">
          {topic.current_concept && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Current concept</span>
              <span className="font-medium truncate ml-2 max-w-[180px]">
                {topic.current_concept}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{percent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-sm bg-muted border border-border overflow-hidden">
            <div
              className="h-full rounded-sm bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => setActiveTab("plan-mode")}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-border px-3 py-1.5 text-xs font-medium neo-hover transition-colors cursor-pointer"
        >
          <ChecklistBoldDuotone className="size-3" />
          View Plan
        </button>
        {hasStarted ? (
          <button
            onClick={() => router.push(`/threads/${topic.latest_thread.id}`)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground neo-hover transition-colors cursor-pointer"
          >
            <CourseUpBoldDuotone className="size-3" />
            Continue Learning
            <ArrowRightBoldDuotone className="size-3" />
          </button>
        ) : onStart ? (
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground neo-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            <PlayBoldDuotone className="size-3" />
            {loading ? "Starting..." : "Start Learning"}
            {!loading && <ArrowRightBoldDuotone className="size-3" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
