import { type ReactNode } from "react";
import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "@/components/graph/node-handles";

// ── Entity colors (single source of truth) ──────────────────────────────

export type EntityType = "concept" | "person" | "fact" | "belief" | "resource";

export const ENTITY_COLORS: Record<EntityType, { border: string; bg: string }> = {
  concept:  { border: "var(--border)", bg: "color-mix(in srgb, var(--border) 8%, transparent)" },
  person:   { border: "var(--color-node-person)", bg: "color-mix(in srgb, var(--color-node-person) 8%, transparent)" },
  fact:     { border: "var(--color-node-fact)", bg: "color-mix(in srgb, var(--color-node-fact) 8%, transparent)" },
  belief:   { border: "var(--color-node-belief)", bg: "color-mix(in srgb, var(--color-node-belief) 8%, transparent)" },
  resource: { border: "var(--color-node-resource)", bg: "color-mix(in srgb, var(--color-node-resource) 8%, transparent)" },
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
