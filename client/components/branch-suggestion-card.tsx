"use client";

import { GitBranch, CircleX } from "lucide-react";

interface BranchSuggestionCardProps {
  topic: string;
  reason: string;
  loading?: boolean;
  onBranch: () => void;
  onDismiss: () => void;
}

export function BranchSuggestionCard({
  topic,
  reason,
  loading,
  onBranch,
  onDismiss,
}: BranchSuggestionCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border-2 border-border bg-card shadow-md p-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex-shrink-0 rounded-md bg-primary/10 p-2 border-2 border-border">
        <GitBranch className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{topic}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{reason}</p>
        <button
          onClick={onBranch}
          disabled={loading}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground border-2 border-border shadow-sm neo-hover disabled:opacity-50 cursor-pointer"
        >
          <GitBranch className="h-3 w-3" />
          {loading ? "Branching..." : "Explore as rabbit hole"}
        </button>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <CircleX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
