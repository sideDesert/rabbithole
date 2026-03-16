"use client";

import type { Evaluation } from "@/lib/api";

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-sm bg-muted border border-border overflow-hidden">
        <div
          className="h-full rounded-sm bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium w-10 text-right">{pct}%</span>
    </div>
  );
}

export function EvaluationDetail({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="border-2 border-border shadow-sm rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{evaluation.concept_name}</h3>
          <p className="text-xs text-muted-foreground">
            {new Date(evaluation.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className="border-2 border-border rounded-md px-3 py-1 text-2xl font-bold">
          {Math.round(evaluation.overall_score * 100)}%
        </span>
      </div>

      {evaluation.scores && (
        <div className="space-y-2">
          <ScoreBar label="Clarity" score={evaluation.scores.clarity} />
          <ScoreBar label="Accuracy" score={evaluation.scores.accuracy} />
          <ScoreBar label="Depth" score={evaluation.scores.depth} />
          <ScoreBar label="Transferability" score={evaluation.scores.transferability} />
        </div>
      )}

      {evaluation.feedback && (
        <p className="text-sm text-muted-foreground">{evaluation.feedback}</p>
      )}

      {evaluation.weak_areas.length > 0 && (
        <div className="text-sm">
          <span className="font-medium">Areas to improve: </span>
          {evaluation.weak_areas.join(", ")}
        </div>
      )}

      {evaluation.improvements.length > 0 && (
        <div className="text-sm">
          <span className="font-medium">Suggestions: </span>
          <ul className="list-disc list-inside mt-1">
            {evaluation.improvements.map((imp, i) => (
              <li key={i} className="text-muted-foreground">{imp}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.mastery_update && (
        <div className="text-xs text-muted-foreground border-t-2 border-border pt-2">
          Mastery: {Math.round(evaluation.mastery_update.previous_score * 100)}% →{" "}
          {Math.round(evaluation.mastery_update.new_score * 100)}% ({evaluation.mastery_update.tier})
        </div>
      )}
    </div>
  );
}
