import { type NodeProps } from "@xyflow/react";
import { Rabbit } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./node-handles";

interface MemoryHubData {
  mastery_score: number;
  concept_count: number;
  display_name: string;
  description: string;
}

export function MemoryHubNode({ data, selected }: NodeProps) {
  const d = data as unknown as MemoryHubData;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const score = d.mastery_score;

  return (
    <div
      className={cn(
        "rounded-full px-6 py-5 cursor-pointer transition-all shadow-xl border-2",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        background: isDark
          ? "radial-gradient(circle at 30% 30%, hsl(260, 50%, 25%), hsl(260, 40%, 12%))"
          : "radial-gradient(circle at 30% 30%, hsl(260, 40%, 95%), hsl(260, 30%, 88%))",
        borderColor: isDark ? "hsl(260, 60%, 55%)" : "hsl(260, 50%, 60%)",
        minWidth: 160,
      }}
    >
      <NodeHandles />

      <div className="flex flex-col items-center gap-1.5">
        <Rabbit
          size={28}
          color={isDark ? "hsl(260, 70%, 75%)" : "hsl(260, 50%, 40%)"}
        />
        <p
          className="text-sm font-bold"
          style={{ color: isDark ? "hsl(260, 70%, 85%)" : "hsl(260, 50%, 30%)" }}
        >
          {d.display_name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {d.concept_count} concepts | {Math.round(score * 100)}% avg
        </p>
      </div>
    </div>
  );
}
