"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEvaluations, type Evaluation } from "@/lib/api";
import { EvaluationDetail } from "@/components/evaluation-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function EvaluationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["evaluations"],
    queryFn: () => getEvaluations(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const evaluations = data?.evaluations ?? [];
  const selected = evaluations.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Evaluations</h1>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && evaluations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No evaluations yet. Complete a Feynman exercise to see your results here.
        </p>
      )}

      {!isLoading && evaluations.length > 0 && !selected && (
        <div className="space-y-2">
          {evaluations.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setSelectedId(ev.id)}
              className="w-full flex items-center justify-between px-4 py-3 border border-border rounded-lg hover:bg-accent/50 transition-colors text-left"
            >
              <div>
                <span className="font-medium">{ev.concept_name}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {ev.topic_slug.replace(/-/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-sm font-medium",
                  ev.overall_score >= 0.7 ? "text-emerald-500" : ev.overall_score >= 0.4 ? "text-amber-500" : "text-red-500",
                )}>
                  {Math.round(ev.overall_score * 100)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(ev.created_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div>
          <button
            onClick={() => setSelectedId(null)}
            className="text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            ← Back to all evaluations
          </button>
          <div className="border border-border rounded-lg p-4">
            <EvaluationDetail evaluation={selected} />
          </div>
        </div>
      )}
    </div>
  );
}
