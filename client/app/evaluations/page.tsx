"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEvaluations, type Evaluation } from "@/lib/api";
import { EvaluationDetail } from "@/components/evaluation-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Filter = "all" | "feynman" | "practice";

const EMPTY_MESSAGES: Record<Filter, string> = {
  all: "No evaluations yet. Complete a Feynman exercise or practice test to see your results here.",
  feynman:
    "No Feynman evaluations yet. Complete a Feynman exercise to see your results here.",
  practice:
    "No practice evaluations yet. Complete a practice test to see your results here.",
};

export default function EvaluationsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["evaluations", filter],
    queryFn: () =>
      getEvaluations(undefined, filter === "all" ? undefined : filter),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const evaluations = data?.evaluations ?? [];
  const selected = evaluations.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      <h1 className="font-heading text-2xl font-bold tracking-tight mb-6">
        Evaluations
      </h1>

      {!selected && (
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as Filter);
            setSelectedId(null);
          }}
          className="mb-6"
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="feynman">Feynman</TabsTrigger>
            <TabsTrigger value="practice">Practice</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              className="h-16 w-full rounded-md border-2 border-border"
            />
          ))}
        </div>
      )}

      {!isLoading && evaluations.length === 0 && (
        <div className="border-2 border-dashed border-border rounded-md p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {EMPTY_MESSAGES[filter]}
          </p>
        </div>
      )}

      {!isLoading && evaluations.length > 0 && !selected && (
        <div className="space-y-3">
          {evaluations.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setSelectedId(ev.id)}
              className="neo-hover w-full flex items-center justify-between px-5 py-3.5 border-2 border-border rounded-md bg-card shadow-[3px_3px_0px_0px_var(--border)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all text-left"
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-heading text-base font-semibold">
                    {ev.concept_name}
                  </span>
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {ev.test_type}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground capitalize">
                  {ev.topic_slug.replace(/-/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "font-heading text-lg font-bold",
                    ev.overall_score >= 0.7
                      ? "text-emerald-600 dark:text-emerald-400"
                      : ev.overall_score >= 0.4
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400",
                  )}
                >
                  {Math.round(ev.overall_score * 100)}%
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {new Date(ev.created_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div>
          <Button onClick={() => setSelectedId(null)}>
            <span>&larr;</span> Back to all evaluations
          </Button>
          <div className="border-2 mt-4 shadow-[3px_3px_0px_0px_var(--border)] border-border rounded-md p-6 bg-card">
            <EvaluationDetail evaluation={selected} />
          </div>
        </div>
      )}
    </div>
  );
}
