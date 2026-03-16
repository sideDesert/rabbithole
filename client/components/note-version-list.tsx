"use client";

import { useState } from "react";
import type { FeynmanNote } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NoteVersionListProps {
  notes: FeynmanNote[];
}

export function NoteVersionList({ notes }: NoteVersionListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">No notes yet.</p>;
  }

  return (
    <div className="space-y-2">
      {notes.map((note) => {
        const isExpanded = expandedId === note.id;
        const score = note.evaluation?.overall_score;

        return (
          <div key={note.id} className="border-2 border-border rounded-md">
            <button
              onClick={() => setExpandedId(isExpanded ? null : note.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent rounded-md transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  v{note.version}
                </span>
                <span className="text-sm truncate max-w-[200px]">
                  {note.markdown.slice(0, 80)}
                  {note.markdown.length > 80 ? "..." : ""}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {score != null && (
                  <span className={cn(
                    "text-xs font-medium",
                    score >= 0.7 ? "text-emerald-500" : score >= 0.4 ? "text-amber-500" : "text-red-500",
                  )}>
                    {Math.round(score * 100)}%
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(note.created_at).toLocaleDateString()}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-border">
                <div className="prose prose-sm dark:prose-invert max-w-none pt-2 whitespace-pre-wrap">
                  {note.markdown}
                </div>
                {note.evaluation && (
                  <div className="mt-3 pt-2 border-t border-border space-y-1">
                    {note.evaluation.scores && (
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Clarity: {Math.round(note.evaluation.scores.clarity * 100)}%</span>
                        <span>Accuracy: {Math.round(note.evaluation.scores.accuracy * 100)}%</span>
                        <span>Depth: {Math.round(note.evaluation.scores.depth * 100)}%</span>
                        <span>Transfer: {Math.round(note.evaluation.scores.transferability * 100)}%</span>
                      </div>
                    )}
                    {note.evaluation.feedback && (
                      <p className="text-xs text-muted-foreground">{note.evaluation.feedback}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
