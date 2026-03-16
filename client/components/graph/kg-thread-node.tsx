import { type NodeProps } from "@xyflow/react";
import { ChatSquareBoldDuotone } from "solar-icon-set";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./node-handles";

interface KgThreadNodeData {
  display_name: string;
  thread_phase: string;
  thread_status: string;
  thread_depth: number;
}

const phaseColor: Record<string, string> = {
  interview: "#88e5d6",   // teal
  planning: "#ffe156",    // yellow
  teaching: "#e85d3a",    // coral
};

export function KgThreadNode({ data, selected }: NodeProps) {
  const d = data as unknown as KgThreadNodeData;
  const color = phaseColor[d.thread_phase] ?? "#64748b";

  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 min-w-[120px] max-w-[180px] cursor-pointer transition-all bg-card border-2 border-border shadow-sm",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        boxShadow: "var(--graph-node-shadow)",
      }}
    >
      <NodeHandles />

      <div className="flex items-center gap-1.5">
        <ChatSquareBoldDuotone size={14} className="shrink-0" color={color} />
        <p className="text-[11px] font-medium text-foreground truncate">{d.display_name}</p>
      </div>
      <p className="text-[9px] text-muted-foreground mt-0.5 capitalize">{d.thread_phase}</p>
    </div>
  );
}
