import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./node-handles";

interface ThreadNodeData {
  title: string;
  phase: string;
  depth: number;
  current_concept: string | null;
  status: string;
  progress: number | null;
  first_question: string | null;
}

const phaseDotColors: Record<string, string> = {
  interview: "bg-accent",
  planning: "bg-secondary",
  teaching: "bg-primary",
};

export function ThreadNode({ data, selected }: NodeProps) {
  const d = data as unknown as ThreadNodeData;
  const isRoot = d.depth === 0;

  return (
    <div
      className={cn(
        "bg-card border-2 border-border rounded-md px-4 py-3 min-w-[200px] max-w-[280px] cursor-pointer transition-shadow shadow-sm",
        isRoot && "border-primary shadow-md",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <NodeHandles />

      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1 inline-flex items-center gap-1 bg-background text-foreground dark:bg-black dark:text-white dark:border dark:border-border">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            phaseDotColors[d.phase] ?? "bg-muted-foreground",
          )}
        />
        {d.phase}
      </span>

      <p className="text-sm font-medium text-foreground truncate">{d.title}</p>

      {d.first_question && (
        <p className="text-xs text-muted-foreground/80 mt-1 italic line-clamp-2">
          &ldquo;{d.first_question}&rdquo;
        </p>
      )}

      {d.current_concept && (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {d.current_concept}
        </p>
      )}

      {d.progress !== null && (
        <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round(d.progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
