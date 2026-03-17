import { type ReactNode } from "react";
import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

// ── Entity colors (single source of truth) ──────────────────────────────

export type EntityType = "concept" | "person" | "fact" | "belief" | "resource";

export const ENTITY_COLORS: Record<EntityType, { border: string; bg: string }> = {
  concept:  { border: "var(--border)", bg: "color-mix(in srgb, var(--border) 8%, transparent)" },
  person:   { border: "#e85d3a", bg: "#e85d3a14" },
  fact:     { border: "#4a90d9", bg: "#4a90d914" },
  belief:   { border: "#ffcc00", bg: "#ffcc0014" },
  resource: { border: "#999999", bg: "#99999914" },
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
        "rounded-lg px-3 py-2.5 cursor-pointer transition-all shadow-sm",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        border: `2px solid ${borderColor ?? colors.border}`,
        background: bgColor ?? "var(--card)",
        boxShadow: "var(--graph-node-shadow)",
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
