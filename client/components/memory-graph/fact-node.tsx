import { type NodeProps } from "@xyflow/react";
import { CircleCheck, Circle } from "lucide-react";
import { MemoryNodeShell } from "./shared";

interface FactData {
  name: string;
  statement: string;
  verified: boolean | null;
}

export function FactNode({ data, selected }: NodeProps) {
  const d = data as unknown as FactData;
  return (
    <MemoryNodeShell selected={selected} entityType="fact" maxWidth="240px">
      <div className="flex items-start gap-2">
        {d.verified ? (
          <span className="shrink-0 mt-0.5" style={{ color: "#4a90d9" }}><CircleCheck size={16} /></span>
        ) : (
          <span className="shrink-0 mt-0.5" style={{ color: "#4a90d980" }}><Circle size={16} /></span>
        )}
        <p className="text-xs text-foreground line-clamp-3">
          {d.statement || d.name}
        </p>
      </div>
    </MemoryNodeShell>
  );
}
