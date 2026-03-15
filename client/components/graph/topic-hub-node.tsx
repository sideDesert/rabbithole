import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./node-handles";

interface TopicHubData {
  name: string;
  display_name: string;
  mastery_score: number;
  concept_count: number;
  domain: string;
}

function domainHue(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function TopicHubNode({ data, selected }: NodeProps) {
  const d = data as unknown as TopicHubData;
  const hue = d.domain ? domainHue(d.domain) : 220;
  const score = d.mastery_score;

  return (
    <div
      className={cn(
        "rounded-2xl px-5 py-4 min-w-[200px] cursor-pointer transition-all shadow-md",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        background: `hsl(${hue}, 30%, 15%)`,
        border: `2px solid hsl(${hue}, 60%, 50%)`,
      }}
    >
      <NodeHandles />

      <div className="text-center">
        <p
          className="text-base font-bold capitalize"
          style={{ color: `hsl(${hue}, 70%, 75%)` }}
        >
          {d.display_name}
        </p>
        <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
          <span>{d.concept_count} concepts</span>
          <span className="text-[10px] opacity-50">|</span>
          <span>{Math.round(score * 100)}% avg</span>
        </div>
        {/* Mini progress bar */}
        <div className="mt-2 h-1 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.round(score * 100)}%`,
              background: `hsl(${hue}, 60%, 50%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
