import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

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
    <div
      className={cn(
        "rounded-lg px-4 py-3 min-w-[160px] max-w-[220px] cursor-pointer transition-all",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: "2px solid #2dd4bf",
        background: "hsla(175, 60%, 40%, 0.12)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        opacity: d.confidence < 0.5 ? 0.5 : d.confidence < 0.8 ? 0.75 : 1,
      }}
    >
      <NodeHandles />
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
    </div>
  );
}
