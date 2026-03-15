"use client";

import { type FeynmanResult } from "@/lib/api";

interface FeynmanResultsProps {
  result: FeynmanResult;
  onContinue: () => void;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium w-10 text-right">{pct}%</span>
    </div>
  );
}

export function FeynmanResults({ result, onContinue }: FeynmanResultsProps) {
  const scores = result.scores;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Your Score</h3>
        <span className="text-2xl font-bold">
          {Math.round(result.overall_score * 100)}%
        </span>
      </div>

      {scores && (
        <div className="space-y-2">
          <ScoreBar label="Clarity" score={scores.clarity} />
          <ScoreBar label="Accuracy" score={scores.accuracy} />
          <ScoreBar label="Depth" score={scores.depth} />
          <ScoreBar label="Transferability" score={scores.transferability} />
        </div>
      )}

      {result.feedback && (
        <p className="text-sm text-muted-foreground">{result.feedback}</p>
      )}

      {result.weak_areas.length > 0 && (
        <div className="text-sm">
          <span className="font-medium">Areas to improve: </span>
          {result.weak_areas.join(", ")}
        </div>
      )}

      {result.mastery_update && (
        <div className="text-xs text-muted-foreground border-t pt-2">
          Mastery: {Math.round(result.mastery_update.previous_score * 100)}% →{" "}
          {Math.round(result.mastery_update.new_score * 100)}% ({result.mastery_update.tier})
        </div>
      )}

      <button
        onClick={onContinue}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}
