import { type NodeProps } from "@xyflow/react";
import { Rabbit } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./node-handles";

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
        "rounded-full px-6 py-5 cursor-pointer transition-all shadow-md border-2 border-border",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        background: "radial-gradient(circle at 30% 30%, var(--hub-gradient-start), var(--hub-gradient-end))",
        minWidth: 160,
      }}
    >
      <NodeHandles />

      <div className="flex flex-col items-center gap-1.5">
        <Rabbit
          size={28}
          className="text-primary"
        />
        <p
          className="text-sm font-bold text-foreground"
        >
          {d.display_name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {d.concept_count} concepts | {Math.round(score * 100)}% avg
        </p>
      </div>
    </div>
  );
}
