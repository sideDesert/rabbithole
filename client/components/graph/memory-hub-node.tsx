import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Rabbit } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryHubData {
  mastery_score: number;
  concept_count: number;
  display_name: string;
  description: string;
}

export function MemoryHubNode({ data, selected }: NodeProps) {
  const d = data as unknown as MemoryHubData;
  const score = d.mastery_score;

  return (
    <div
      className={cn(
        "rounded-full px-6 py-5 cursor-pointer transition-all shadow-xl border-2",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        background: "radial-gradient(circle at 30% 30%, hsl(260, 50%, 25%), hsl(260, 40%, 12%))",
        borderColor: "hsl(260, 60%, 55%)",
        minWidth: 160,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />

      <div className="flex flex-col items-center gap-1.5">
        <Rabbit className="size-7" style={{ color: "hsl(260, 70%, 75%)" }} />
        <p className="text-sm font-bold" style={{ color: "hsl(260, 70%, 85%)" }}>
          {d.display_name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {d.concept_count} concepts | {Math.round(score * 100)}% avg
        </p>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
    </div>
  );
}
