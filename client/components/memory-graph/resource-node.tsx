import { type NodeProps } from "@xyflow/react";
import { BookOpen, FileText, Video, MessageSquare, Code } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

interface ResourceData {
  name: string;
  title: string;
  resource_type: string;
}

const TYPE_ICONS: Record<string, typeof BookOpen> = {
  book: BookOpen,
  article: FileText,
  video: Video,
  conversation: MessageSquare,
  docs: Code,
};

export function ResourceNode({ data, selected }: NodeProps) {
  const d = data as unknown as ResourceData;
  const Icon = TYPE_ICONS[d.resource_type] || FileText;
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 min-w-[140px] max-w-[200px] cursor-pointer transition-all",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: "2px solid #64748b",
        background: "hsla(220, 10%, 40%, 0.12)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <NodeHandles />
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-slate-400" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{d.title || d.name}</p>
          <span className="text-[9px] text-muted-foreground/60">{d.resource_type}</span>
        </div>
      </div>
    </div>
  );
}
