import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

interface BeliefData {
  name: string;
  statement: string;
  correct: boolean | null;
}

function beliefColor(correct: boolean | null): { border: string; bg: string; label: string } {
  if (correct === true) return { border: "#fbbf24", bg: "hsla(45, 93%, 47%, 0.12)", label: "correct" };
  if (correct === false) return { border: "#f87171", bg: "hsla(0, 84%, 60%, 0.12)", label: "incorrect" };
  return { border: "#64748b", bg: "hsla(220, 10%, 50%, 0.12)", label: "unverified" };
}

export function BeliefNode({ data, selected }: NodeProps) {
  const d = data as unknown as BeliefData;
  const { border, bg, label } = beliefColor(d.correct);
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 min-w-[160px] max-w-[240px] cursor-pointer transition-all",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: `2px solid ${border}`,
        background: bg,
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <NodeHandles />
      <div className="space-y-1">
        <p className="text-xs text-foreground line-clamp-3">
          {d.statement || d.name}
        </p>
        <span className="text-[9px] capitalize" style={{ color: border }}>{label}</span>
      </div>
    </div>
  );
}
