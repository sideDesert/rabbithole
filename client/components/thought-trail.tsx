import type { TrailStep } from "@/hooks/use-chat";

interface ThoughtTrailProps {
  steps: TrailStep[];
  collapsed: boolean;
  onToggle: () => void;
}

export function ThoughtTrail({ steps, collapsed, onToggle }: ThoughtTrailProps) {
  if (steps.length === 0) return null;

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer mb-1"
      >
        ⋯ {steps.length} steps
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 mb-2">
      {steps.map((step, i) => (
        <div
          key={`${step.key}-${i}`}
          className="flex items-center gap-2 animate-in fade-in duration-200"
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground ${
              step.type === "tool_call" && !step.done
                ? "trail-dot-pulse"
                : "opacity-40"
            }`}
          />
          <span className="text-sm text-muted-foreground">{step.label}</span>
        </div>
      ))}
    </div>
  );
}
