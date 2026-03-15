import { type NodeProps } from "@xyflow/react";
import { UserBoldDuotone } from "solar-icon-set";
import { MemoryNodeShell } from "./shared";

interface PersonData {
  name: string;
  role: string;
}

export function PersonNode({ data, selected }: NodeProps) {
  const d = data as unknown as PersonData;
  return (
    <MemoryNodeShell selected={selected} entityType="person" minWidth="140px" maxWidth="200px">
      <div className="flex items-center gap-2">
        <UserBoldDuotone size={20} className="shrink-0 text-purple-600 dark:text-purple-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
          {d.role && <span className="text-[10px] text-purple-600/70 dark:text-purple-400/70">{d.role}</span>}
        </div>
      </div>
    </MemoryNodeShell>
  );
}
