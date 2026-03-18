import { type NodeProps } from "@xyflow/react";
import { MemoryNodeShell } from "./shared";

interface BeliefData {
  name: string;
  statement: string;
  correct: boolean | null;
}

function beliefStyle(correct: boolean | null) {
  if (correct === true) return { border: "var(--color-node-belief)", bg: "color-mix(in srgb, var(--color-node-belief) 8%, transparent)", label: "correct" };
  if (correct === false) return { border: "var(--color-node-person)", bg: "color-mix(in srgb, var(--color-node-person) 8%, transparent)", label: "incorrect" };
  return { border: "var(--color-node-resource)", bg: "color-mix(in srgb, var(--color-node-resource) 8%, transparent)", label: "unverified" };
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
