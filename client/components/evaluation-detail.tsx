"use client";

import type { Evaluation } from "@/lib/api";

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-28 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2.5 bg-muted border-2 border-border overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-heading text-sm font-semibold w-10 text-right tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

export function EvaluationDetail({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-heading text-xl font-bold">
            {evaluation.concept_name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {new Date(evaluation.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className="font-heading border-2 border-border bg-secondary rounded-md px-3 py-1 text-2xl text-accent-foreground">
          {Math.round(evaluation.overall_score * 100)}%
        </span>
      </div>

      {evaluation.scores && (
        <div className="space-y-3">
          <ScoreBar label="Clarity" score={evaluation.scores.clarity} />
          <ScoreBar label="Accuracy" score={evaluation.scores.accuracy} />
          <ScoreBar label="Depth" score={evaluation.scores.depth} />
          <ScoreBar
            label="Transferability"
            score={evaluation.scores.transferability}
          />
        </div>
      )}

      {evaluation.feedback && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {evaluation.feedback}
        </p>
      )}

      {evaluation.weak_areas.length > 0 && (
        <div className="text-sm">
          <span className="font-heading font-semibold">Areas to improve</span>
          <p className="text-muted-foreground mt-1">
            {evaluation.weak_areas.join(", ")}
          </p>
        </div>
      )}

      {evaluation.improvements.length > 0 && (
        <div className="text-sm">
          <span className="font-heading font-semibold">Suggestions</span>
          <ul className="list-disc list-inside mt-1.5 space-y-1">
            {evaluation.improvements.map((imp, i) => (
              <li key={i} className="text-muted-foreground">
                {imp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.mastery_update && (
        <div className="text-xs text-muted-foreground border-t-2 border-border pt-3 flex items-center gap-2">
          <span className="font-heading font-semibold text-foreground">
            Mastery:
          </span>
          <span className="tabular-nums">
            {Math.round(evaluation.mastery_update.previous_score * 100)}% &rarr;{" "}
            {Math.round(evaluation.mastery_update.new_score * 100)}%
          </span>
          <span className="border-2 border-border rounded-md px-1.5 py-0 text-[10px] font-medium bg-muted capitalize">
            {evaluation.mastery_update.tier}
          </span>
        </div>
      )}
    </div>
  );
}
