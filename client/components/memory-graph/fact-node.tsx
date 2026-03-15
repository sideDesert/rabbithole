import { type NodeProps } from "@xyflow/react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

interface FactData {
  name: string;
  statement: string;
  verified: boolean | null;
}

export function FactNode({ data, selected }: NodeProps) {
  const d = data as unknown as FactData;
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 min-w-[160px] max-w-[240px] cursor-pointer transition-all",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: "2px solid #60a5fa",
        background: "hsla(210, 70%, 50%, 0.12)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <NodeHandles />
      <div className="flex items-start gap-2">
        {d.verified ? (
          <CheckCircle2 className="size-4 shrink-0 text-blue-400 mt-0.5" />
        ) : (
          <Circle className="size-4 shrink-0 text-blue-400/50 mt-0.5" />
        )}
        <p className="text-xs text-foreground line-clamp-3">
          {d.statement || d.name}
        </p>
      </div>
    </div>
  );
}
