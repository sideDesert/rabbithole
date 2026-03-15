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
}

const phaseBadgeColors: Record<string, string> = {
  interview: "bg-chart-1/20 text-chart-1",
  planning: "bg-chart-3/20 text-chart-3",
  teaching: "bg-primary/20 text-primary",
};

export function ThreadNode({ data, selected }: NodeProps) {
  const d = data as unknown as ThreadNodeData;
  const isRoot = d.depth === 0;

  return (
    <div
      className={cn(
        "bg-card border rounded-lg px-4 py-3 min-w-[200px] max-w-[280px] cursor-pointer transition-shadow",
        isRoot ? "border-primary border-2 shadow-md" : "border-border",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <NodeHandles />

      <span
        className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1 inline-block",
          phaseBadgeColors[d.phase] ?? "bg-muted text-muted-foreground",
        )}
      >
        {d.phase}
      </span>

      <p className="text-sm font-medium text-foreground truncate">{d.title}</p>

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
