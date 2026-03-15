import { type NodeProps } from "@xyflow/react";
import { CheckCircleBoldDuotone, RecordCircleBoldDuotone } from "solar-icon-set";
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
          <span className="shrink-0 text-blue-600 dark:text-blue-400 mt-0.5"><CheckCircleBoldDuotone size={16} /></span>
        ) : (
          <span className="shrink-0 text-blue-600/50 dark:text-blue-400/50 mt-0.5"><RecordCircleBoldDuotone size={16} /></span>
        )}
        <p className="text-xs text-foreground line-clamp-3">
          {d.statement || d.name}
        </p>
      </div>
    </MemoryNodeShell>
  );
}
