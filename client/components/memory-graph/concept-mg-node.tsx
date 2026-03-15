import { type NodeProps } from "@xyflow/react";
import { MemoryNodeShell } from "./shared";

interface ConceptMgData {
  name: string;
  mastery: number;
  confidence: number;
  domain: string;
}

function MasteryRing({ score }: { score: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * score;
  return (
    <svg width="28" height="28" className="shrink-0">
      <circle cx="14" cy="14" r={radius} fill="none" stroke="#334155" strokeWidth="3" />
      <circle
        cx="14" cy="14" r={radius} fill="none"
        stroke="#2dd4bf" strokeWidth="3"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ConceptMgNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConceptMgData;
  return (
    <MemoryNodeShell
      selected={selected}
      entityType="concept"
      opacity={d.confidence < 0.5 ? 0.5 : d.confidence < 0.8 ? 0.75 : 1}
    >
      <div className="flex items-center gap-2">
        <MasteryRing score={d.mastery} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
          <span className="text-[10px] text-teal-400">{Math.round(d.mastery * 100)}%</span>
          {d.domain && (
            <span className="text-[9px] text-muted-foreground/60 ml-1">{d.domain}</span>
          )}
        </div>
      </div>
    </MemoryNodeShell>
  );
}
