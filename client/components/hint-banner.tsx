"use client";

import { CircleX } from "lucide-react";

interface HintBannerProps {
  hints: { id: string; text: string }[];
  onDismiss: (id: string) => void;
}

export function HintBanner({ hints, onDismiss }: HintBannerProps) {
  if (hints.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      {hints.map((hint) => (
        <div
          key={hint.id}
          className="flex items-start gap-3 rounded-md border-2 border-border bg-secondary/20 shadow-sm px-4 py-3 text-sm text-muted-foreground"
        >
          <span className="mt-0.5 shrink-0 text-base">💡</span>
          <p className="flex-1 leading-relaxed">{hint.text}</p>
          <button
            onClick={() => onDismiss(hint.id)}
            className="shrink-0 rounded p-0.5 hover:bg-accent"
          >
            <CircleX className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
