import { type NodeProps } from "@xyflow/react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

interface PersonData {
  name: string;
  role: string;
}

export function PersonNode({ data, selected }: NodeProps) {
  const d = data as unknown as PersonData;
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-3 min-w-[140px] max-w-[200px] cursor-pointer transition-all",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: "2px solid #a78bfa",
        background: "hsla(270, 60%, 50%, 0.12)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <NodeHandles />
      <div className="flex items-center gap-2">
        <User className="size-5 shrink-0 text-purple-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
          {d.role && <span className="text-[10px] text-purple-400/70">{d.role}</span>}
        </div>
      </div>
    </div>
  );
}
