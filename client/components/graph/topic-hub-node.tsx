import { type NodeProps } from "@xyflow/react";
import { useTheme } from "next-themes";
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const hue = d.domain ? domainHue(d.domain) : 220;
  const score = d.mastery_score;

  return (
    <div
      className={cn(
        "rounded-lg px-5 py-4 min-w-[200px] cursor-pointer transition-all border-2 border-border shadow-md",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        background: isDark
          ? "linear-gradient(135deg, #2a2118, #1e1c1a)"
          : "linear-gradient(135deg, #fffef5, #f5eed8)",
      }}
    >
      <NodeHandles />

      <div className="text-center">
        <p className="text-base font-bold capitalize text-foreground">
          {d.display_name}
        </p>
        <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
          <span>{d.concept_count} concepts</span>
          <span className="text-[10px] opacity-50">|</span>
          <span>{Math.round(score * 100)}% avg</span>
        </div>
        {/* Mini progress bar */}
        <div className="mt-2 h-1 w-full rounded-full bg-primary/30 overflow-hidden">
          <div
            className="h-full rounded-full transition-all bg-primary"
            style={{
              width: `${Math.round(score * 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
