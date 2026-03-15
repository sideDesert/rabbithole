import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface KgThreadNodeData {
  display_name: string;
  thread_phase: string;
  thread_status: string;
  thread_depth: number;
}

const phaseColor: Record<string, string> = {
  interview: "#a78bfa",   // violet
  planning: "#fbbf24",    // amber
  teaching: "#34d399",    // emerald
};

export function KgThreadNode({ data, selected }: NodeProps) {
  const d = data as unknown as KgThreadNodeData;
  const color = phaseColor[d.thread_phase] ?? "#64748b";

  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 min-w-[120px] max-w-[180px] cursor-pointer transition-all",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: `1.5px solid ${color}`,
        background: "hsla(222, 20%, 12%, 0.95)",
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.3)",
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />

      <div className="flex items-center gap-1.5">
        <MessageSquare className="size-3.5 shrink-0" style={{ color }} />
        <p className="text-[11px] font-medium text-foreground truncate">{d.display_name}</p>
      </div>
      <p className="text-[9px] text-muted-foreground mt-0.5 capitalize">{d.thread_phase}</p>

      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
    </div>
  );
}
