import { type NodeProps } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./node-handles";

interface KgThreadNodeData {
  display_name: string;
  thread_phase: string;
  thread_status: string;
  thread_depth: number;
}

const PHASE_COLORS: Record<string, string> = {
  interview: "var(--graph-phase-interview)",
  planning:  "var(--graph-phase-planning)",
  teaching:  "var(--primary)",
};

export function KgThreadNode({ data, selected }: NodeProps) {
  const d = data as unknown as KgThreadNodeData;
  const color = PHASE_COLORS[d.thread_phase] ?? "var(--color-undiscovered)";

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
        <MessageSquare size={14} className="shrink-0" color={color} />
        <p className="text-[11px] font-medium text-foreground truncate">{d.display_name}</p>
      </div>
      <p className="text-[9px] text-muted-foreground mt-0.5 capitalize">{d.thread_phase}</p>
    </div>
  );
}
