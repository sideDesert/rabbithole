import { type NodeProps } from "@xyflow/react";
import { Atom } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

export function MemoryHubNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        "rounded-full px-5 py-4 cursor-pointer transition-all flex items-center gap-2.5 border-2 border-border bg-card shadow-md",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        boxShadow: "var(--graph-node-shadow)",
      }}
    >
      <NodeHandles />
      <Atom size={24} className="text-foreground/80" />
      <span className="text-sm font-semibold text-foreground/90 tracking-wide">Memory</span>
    </div>
  );
}
