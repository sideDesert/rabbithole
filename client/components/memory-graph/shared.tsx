import { type ReactNode } from "react";
import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

// ── Entity colors (single source of truth) ──────────────────────────────

export type EntityType = "concept" | "person" | "fact" | "belief" | "resource";

export const ENTITY_COLORS: Record<EntityType, { border: string; bg: string }> = {
  concept:  { border: "#2dd4bf", bg: "hsla(175, 60%, 40%, 0.12)" },
  person:   { border: "#a78bfa", bg: "hsla(270, 60%, 50%, 0.12)" },
  fact:     { border: "#60a5fa", bg: "hsla(210, 70%, 50%, 0.12)" },
  belief:   { border: "#fbbf24", bg: "hsla(45, 93%, 47%, 0.12)" },
  resource: { border: "#64748b", bg: "hsla(220, 10%, 40%, 0.12)" },
};

// ── Shared node wrapper ─────────────────────────────────────────────────

interface MemoryNodeShellProps {
  selected: NodeProps["selected"];
  entityType: EntityType;
  /** Override border color (e.g. for belief correct/incorrect states) */
  borderColor?: string;
  bgColor?: string;
  opacity?: number;
  minWidth?: string;
  maxWidth?: string;
  children: ReactNode;
}

/**
 * Shared outer shell for all memory graph nodes.
 * Provides consistent border, background, blur, shadow, selection ring, and handles.
 */
export function MemoryNodeShell({
  selected,
  entityType,
  borderColor,
  bgColor,
  opacity = 1,
  minWidth = "160px",
  maxWidth = "220px",
  children,
}: MemoryNodeShellProps) {
  const colors = ENTITY_COLORS[entityType];
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 cursor-pointer transition-all",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: `2px solid ${borderColor ?? colors.border}`,
        background: bgColor ?? colors.bg,
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        minWidth,
        maxWidth,
        opacity,
      }}
    >
      <NodeHandles />
      {children}
    </div>
  );
}
