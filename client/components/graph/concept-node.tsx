import { type NodeProps } from "@xyflow/react";
import { GraphNewUpBoldDuotone, GraphDownNewBoldDuotone, MinusCircleBoldDuotone } from "solar-icon-set";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./node-handles";

interface ConceptNodeData {
  name: string;
  mastery_score: number;
  strength_trend: "improving" | "stable" | "declining";
  domain: string;
  source: "plan" | "extracted" | "prerequisite";
  confidence: number;
}

// Mastery score → color gradient (red → amber → green → bright green)
function masteryColor(score: number): string {
  if (score >= 0.9) return "hsl(142, 71%, 45%)"; // mastered — bright green
  if (score >= 0.7) return "hsl(142, 50%, 40%)"; // strong — green
  if (score >= 0.4) return "hsl(45, 93%, 47%)";  // medium — amber
  if (score > 0)    return "hsl(0, 84%, 60%)";   // weak — red
  return "#64748b";                                // undiscovered — slate-500
}

function masteryBg(score: number): string {
  if (score >= 0.9) return "hsla(142, 71%, 45%, 0.15)";
  if (score >= 0.7) return "hsla(142, 50%, 40%, 0.12)";
  if (score >= 0.4) return "hsla(45, 93%, 47%, 0.12)";
  if (score > 0)    return "hsla(0, 84%, 60%, 0.12)";
  return "var(--graph-node-bg)";
}

function MasteryRing({ score }: { score: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * score;
  const color = masteryColor(score);

  return (
    <svg width="28" height="28" className="shrink-0">
      <circle cx="14" cy="14" r={radius} fill="none" stroke="var(--graph-ring-track)" strokeWidth="3" />
      <circle
        cx="14"
        cy="14"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
      />
    </svg>
  );
}

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "improving") return <GraphNewUpBoldDuotone size={12} className="text-chart-1" />;
  if (trend === "declining") return <GraphDownNewBoldDuotone size={12} className="text-destructive" />;
  return <MinusCircleBoldDuotone size={12} className="text-muted-foreground" />;
};

export function ConceptNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConceptNodeData;
  const score = d.mastery_score;
  const confidence = d.confidence ?? 1.0;
  const color = masteryColor(score);

  return (
    <div
      className={cn(
        "rounded-md px-4 py-3 min-w-[180px] max-w-[240px] cursor-pointer transition-all shadow-sm",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        opacity: confidence < 0.5 ? 0.5 : confidence < 0.8 ? 0.75 : 1,
        border: `2px solid ${color}`,
        background: masteryBg(score),
        boxShadow: "var(--graph-node-shadow)",
      }}
    >
      <NodeHandles />

      <div className="flex items-center gap-2">
        <MasteryRing score={score} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px]" style={{ color }}>
              {Math.round(score * 100)}%
            </span>
            <TrendIcon trend={d.strength_trend} />
            {d.source === "extracted" && (
              <span className="text-[9px] text-muted-foreground/60 italic">inferred</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
