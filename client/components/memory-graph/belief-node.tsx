import { type NodeProps } from "@xyflow/react";
import { MemoryNodeShell } from "./shared";

interface BeliefData {
  name: string;
  statement: string;
  correct: boolean | null;
}

function beliefStyle(correct: boolean | null) {
  if (correct === true) return { border: "#fbbf24", bg: "hsla(45, 93%, 47%, 0.12)", label: "correct" };
  if (correct === false) return { border: "#f87171", bg: "hsla(0, 84%, 60%, 0.12)", label: "incorrect" };
  return { border: "#64748b", bg: "hsla(220, 10%, 50%, 0.12)", label: "unverified" };
}

export function BeliefNode({ data, selected }: NodeProps) {
  const d = data as unknown as BeliefData;
  const { border, bg, label } = beliefStyle(d.correct);
  return (
    <MemoryNodeShell selected={selected} entityType="belief" borderColor={border} bgColor={bg} maxWidth="240px">
      <div className="space-y-1">
        <p className="text-xs text-foreground line-clamp-3">{d.statement || d.name}</p>
        <span className="text-[9px] capitalize" style={{ color: border }}>{label}</span>
      </div>
    </MemoryNodeShell>
  );
}
