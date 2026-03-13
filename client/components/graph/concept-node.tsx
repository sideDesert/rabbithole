import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConceptNodeData {
  name: string;
  mastery_score: number;
  strength_trend: "improving" | "stable" | "declining";
}

function MasteryRing({ score }: { score: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * score;

  return (
    <svg width="28" height="28" className="shrink-0">
      <circle cx="14" cy="14" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
      <circle
        cx="14"
        cy="14"
        r={radius}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
      />
    </svg>
  );
}

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "improving") return <TrendingUp className="size-3 text-chart-1" />;
  if (trend === "declining") return <TrendingDown className="size-3 text-destructive" />;
  return <Minus className="size-3 text-muted-foreground" />;
};

export function ConceptNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConceptNodeData;
  const score = d.mastery_score;

  const isMastered = score >= 0.7;
  const isMedium = score >= 0.4 && score < 0.7;
  const isWeak = score > 0 && score < 0.4;
  const isUndiscovered = score === 0;

  return (
    <div
      className={cn(
        "bg-card rounded-lg px-4 py-3 min-w-[180px] max-w-[240px] cursor-pointer transition-all",
        isMastered && "border-2 border-primary shadow-sm",
        isMedium && "border border-muted-foreground",
        isWeak && "border border-dashed border-muted-foreground opacity-70",
        isUndiscovered && "border border-dashed border-border opacity-40 blur-[0.5px]",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />

      <div className="flex items-center gap-2">
        <MasteryRing score={score} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {Math.round(score * 100)}%
            </span>
            <TrendIcon trend={d.strength_trend} />
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
    </div>
  );
}
