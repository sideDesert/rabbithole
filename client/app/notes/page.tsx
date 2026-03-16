"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFeynmanNotes, type FeynmanNote } from "@/lib/api";
import { NoteVersionList } from "@/components/note-version-list";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudyTopics } from "@/hooks/use-study-topics";
import { topicGradient, phaseLabel, timeAgo } from "@/lib/topic-utils";
import type { StudyTopic } from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardFooter,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export default function NotesPage() {
  const { topics, isLoading: topicsLoading } = useStudyTopics();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const selectedTopic = selectedSlug
    ? topics.find((t) => t.topic_slug === selectedSlug) ?? null
    : null;

  if (selectedTopic) {
    return (
      <div className="px-6 py-6 max-w-3xl mx-auto">
        <button
          onClick={() => setSelectedSlug(null)}
          className="text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          ← Back to all topics
        </button>
        <h1 className="text-xl font-semibold tracking-tight mb-4">
          {selectedTopic.topic}
        </h1>
        <TopicNotesDetail topicSlug={selectedTopic.topic_slug} />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Feynman Notes</h1>

      {topicsLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border-2 border-border overflow-hidden">
              <Skeleton className="h-28 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!topicsLoading && topics.length === 0 && (
        <div className="border-2 border-dashed border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">
            No study topics yet. Complete some Feynman exercises to see your notes here.
          </p>
        </div>
      )}

      {!topicsLoading && topics.length > 0 && (
        <TooltipProvider>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topics.map((topic) => (
              <TopicNoteCard
                key={topic.topic_slug}
                topic={topic}
                onClick={() => setSelectedSlug(topic.topic_slug)}
              />
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

function TopicNoteCard({
  topic,
  onClick,
}: {
  topic: StudyTopic;
  onClick: () => void;
}) {
  const pct = Math.round(topic.progress * 100);
  const gradient = topicGradient(topic.topic);

  return (
    <Card
      className="relative overflow-hidden pt-0 card-hover transition-all cursor-pointer h-full flex flex-col"
      onClick={onClick}
    >
      <div
        className={`relative flex items-end justify-end bg-gradient-to-br ${gradient} p-4 h-28`}
      >
        <div className="relative flex items-center justify-center">
          <ProgressRing progress={topic.progress} />
          <span className="absolute text-xs font-semibold text-foreground">
            {pct}%
          </span>
        </div>
      </div>

      <CardHeader className="min-w-0">
        <CardAction>
          <Badge variant="secondary">{phaseLabel(topic.phase)}</Badge>
        </CardAction>
        <Tooltip>
          <TooltipTrigger
            render={
              <CardTitle className="text-lg font-bold leading-tight truncate" />
            }
          >
            {topic.topic}
          </TooltipTrigger>
          <TooltipContent side="right">{topic.topic}</TooltipContent>
        </Tooltip>
        {topic.current_concept && (
          <Tooltip>
            <TooltipTrigger
              render={<CardDescription className="truncate" />}
            >
              {topic.current_concept}
            </TooltipTrigger>
            <TooltipContent side="right">
              {topic.current_concept}
            </TooltipContent>
          </Tooltip>
        )}
      </CardHeader>

      <CardFooter className="mt-auto">
        <span className="text-xs text-muted-foreground">
          {timeAgo(topic.latest_thread.updated_at)}
        </span>
      </CardFooter>
    </Card>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const deg = Math.round(progress * 360);
  return (
    <div
      className="rounded-full shrink-0 transition-all duration-500"
      style={{
        width: 56,
        height: 56,
        background: `conic-gradient(var(--primary) ${deg}deg, color-mix(in srgb, var(--primary) 15%, transparent) ${deg}deg)`,
        mask: "radial-gradient(farthest-side, transparent calc(50% - 4px), #000 calc(50% - 3px), #000 50%, transparent 51%)",
        WebkitMask:
          "radial-gradient(farthest-side, transparent calc(50% - 4px), #000 calc(50% - 3px), #000 50%, transparent 51%)",
      }}
    />
  );
}

function TopicNotesDetail({ topicSlug }: { topicSlug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["feynman-notes", topicSlug],
    queryFn: () => getFeynmanNotes(topicSlug),
  });

  const notes = data?.notes ?? [];

  const byConceptMap = new Map<string, FeynmanNote[]>();
  for (const note of notes) {
    const existing = byConceptMap.get(note.concept_name) ?? [];
    existing.push(note);
    byConceptMap.set(note.concept_name, existing);
  }
  const byConcept = Array.from(byConceptMap.entries());

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (byConcept.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No notes for this topic yet.</p>
    );
  }

  return (
    <div className="space-y-6">
      {byConcept.map(([concept, conceptNotes]) => (
        <div key={concept}>
          <h3 className="text-sm font-medium mb-2">{concept}</h3>
          <NoteVersionList notes={conceptNotes} />
        </div>
      ))}
    </div>
  );
}
