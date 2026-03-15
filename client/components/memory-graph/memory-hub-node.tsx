import { type NodeProps } from "@xyflow/react";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

export function MemoryHubNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        "rounded-full px-5 py-4 cursor-pointer transition-all flex items-center gap-2.5",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: "2px solid #e2e8f0",
        background: "hsla(220, 20%, 95%, 0.15)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 0 24px rgba(255, 255, 255, 0.08), 0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      <NodeHandles />
      <Brain className="size-6 text-white/80" />
      <span className="text-sm font-semibold text-white/90 tracking-wide">Memory</span>
    </div>
  );
}
