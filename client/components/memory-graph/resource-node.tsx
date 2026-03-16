import { type NodeProps } from "@xyflow/react";
import { BookBoldDuotone, DocumentTextBoldDuotone, VideoFrameBoldDuotone, ChatSquareBoldDuotone, CodeBoldDuotone } from "solar-icon-set";
import { MemoryNodeShell } from "./shared";

interface ResourceData {
  name: string;
  title: string;
  resource_type: string;
}

const TYPE_ICONS: Record<string, typeof BookBoldDuotone> = {
  book: BookBoldDuotone,
  article: DocumentTextBoldDuotone,
  video: VideoFrameBoldDuotone,
  conversation: ChatSquareBoldDuotone,
  docs: CodeBoldDuotone,
};

export function ResourceNode({ data, selected }: NodeProps) {
  const d = data as unknown as ResourceData;
  const Icon = TYPE_ICONS[d.resource_type] || DocumentTextBoldDuotone;
  return (
    <MemoryNodeShell selected={selected} entityType="resource" minWidth="140px" maxWidth="200px">
      <div className="flex items-center gap-2">
        <Icon size={16} className="shrink-0" style={{ color: "#999999" }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{d.title || d.name}</p>
          <span className="text-[9px] text-muted-foreground/60">{d.resource_type}</span>
        </div>
      </div>
    </MemoryNodeShell>
  );
}
