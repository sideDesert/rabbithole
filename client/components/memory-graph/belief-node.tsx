import { type NodeProps } from "@xyflow/react";
import { MemoryNodeShell } from "./shared";

interface BeliefData {
  name: string;
  statement: string;
  correct: boolean | null;
}

function beliefStyle(correct: boolean | null) {
  if (correct === true) return { border: "#ffcc00", bg: "#ffcc0014", label: "correct" };
  if (correct === false) return { border: "#e85d3a", bg: "#e85d3a14", label: "incorrect" };
  return { border: "#999999", bg: "#99999914", label: "unverified" };
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
