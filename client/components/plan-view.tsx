"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProgress,
  toggleConcept,
  type PlanPhase,
  type PlanConcept,
} from "@/lib/api";
import { usePlan } from "./plan-context";
import { ListChecks, ChevronDown, ChevronRight, CircleCheck, TestTube } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-sm bg-muted border border-border overflow-hidden">
      <div
        className="h-full rounded-sm bg-primary transition-all duration-500"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

function ConceptRow({
  concept,
  threadId,
  topicSlug,
}: {
  concept: PlanConcept;
  threadId: string;
  topicSlug: string | null;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => toggleConcept(threadId, concept.name, !concept.completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["progress", threadId] });
    },
  });

  return (
    <label className="flex items-start gap-3 py-2 px-1 rounded-md hover:bg-muted/50 cursor-pointer group transition-colors">
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="mt-0.5 shrink-0 size-[18px] rounded border-2 border-border flex items-center justify-center transition-colors cursor-pointer data-[checked=true]:bg-primary data-[checked=true]:border-primary"
        data-checked={concept.completed}
      >
        {concept.completed && (
          <CircleCheck className="size-3 text-primary-foreground" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm font-medium ${concept.completed ? "line-through text-muted-foreground" : ""}`}
        >
          {concept.name}
        </span>
        {concept.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {concept.description}
          </p>
        )}
      </div>
      {concept.completed && topicSlug && (
        <Link
          href={`/practice/test?concept=${encodeURIComponent(concept.name)}&topic=${encodeURIComponent(topicSlug)}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 mt-0.5 p-1 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
          title="Take a test"
        >
          <TestTube className="size-3.5 text-muted-foreground" />
        </Link>
      )}
    </label>
  );
}

function PhaseSection({
  phase,
  threadId,
  topicSlug,
  defaultOpen,
}: {
  phase: PlanPhase;
  threadId: string;
  topicSlug: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const completedCount = phase.concepts.filter((c) => c.completed).length;

  return (
    <div className="border-2 border-border shadow-md rounded-lg overflow-hidden w-full">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left cursor-pointer"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold truncate">{phase.title}</h3>
            <span className="text-xs text-muted-foreground shrink-0">
              {completedCount}/{phase.concepts.length}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={phase.progress} />
          </div>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 border-t-2 border-border pt-2">
          {phase.concepts.map((concept) => (
            <ConceptRow
              key={concept.name}
              concept={concept}
              threadId={threadId}
              topicSlug={topicSlug}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PlanView() {
  const { threadId, topicSlug } = usePlan();
  const { data, isLoading } = useQuery({
    queryKey: ["progress", threadId],
    queryFn: () => getProgress(threadId!),
    enabled: !!threadId,
  });

  if (!threadId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <ListChecks className="size-10 opacity-40" />
        <p>Start a conversation to create a learning plan.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="thinking-orb" />
      </div>
    );
  }

  if (!data?.phases?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <ListChecks className="size-10 opacity-40" />
        <p>No plan created yet for this thread.</p>
      </div>
    );
  }

  const totalConcepts = data.phases.reduce(
    (sum, p) => sum + p.concepts.length,
    0,
  );
  const completedConcepts = data.phases.reduce(
    (sum, p) => sum + p.concepts.filter((c) => c.completed).length,
    0,
  );

  const firstIncompletePhaseIdx = data.phases.findIndex((p) => p.progress < 1);

  return (
    <div className="w-full max-w-3xl mx-auto px-10 pt-8 pb-16 overflow-auto h-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{data.topic}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
          {data.depth && (
            <span className="capitalize">{data.depth.replace(/_/g, " ")}</span>
          )}
          {data.depth && data.prior_knowledge && <span>&middot;</span>}
          {data.prior_knowledge && <span>{data.prior_knowledge}</span>}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar value={data.overall_progress} />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {completedConcepts}/{totalConcepts} concepts
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {data.phases.map((phase, idx) => (
          <PhaseSection
            key={phase.order}
            phase={phase}
            threadId={threadId}
            topicSlug={topicSlug}
            defaultOpen={idx === firstIncompletePhaseIdx || idx === 0}
          />
        ))}
      </div>
    </div>
  );
}
