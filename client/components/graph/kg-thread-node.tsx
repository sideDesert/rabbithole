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

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const phaseConfig: Record<string, { cssVar: string; fallback: string }> = {
  interview: { cssVar: "--graph-phase-interview", fallback: "#000000" },
  planning:  { cssVar: "--graph-phase-planning",  fallback: "#000000" },
  teaching:  { cssVar: "",                        fallback: "#e85d3a" },
};

export function KgThreadNode({ data, selected }: NodeProps) {
  const d = data as unknown as KgThreadNodeData;
  const config = phaseConfig[d.thread_phase] ?? { cssVar: "", fallback: "#64748b" };
  const color = config.cssVar ? (getCSSVar(config.cssVar) || config.fallback) : config.fallback;

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
