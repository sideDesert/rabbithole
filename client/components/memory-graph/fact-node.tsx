import { type NodeProps } from "@xyflow/react";
import { CheckCircle2, Circle } from "lucide-react";
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
          <CheckCircle2 className="size-4 shrink-0 text-blue-400 mt-0.5" />
        ) : (
          <Circle className="size-4 shrink-0 text-blue-400/50 mt-0.5" />
        )}
        <p className="text-xs text-foreground line-clamp-3">
          {d.statement || d.name}
        </p>
      </div>
    </MemoryNodeShell>
  );
}
