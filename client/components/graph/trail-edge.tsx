import { EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

type EdgeType = "prerequisite_of" | "part_of" | "explored_from" | "confused_with";

interface TrailEdgeData {
  branch_topic?: string | null;
  edgeType?: EdgeType;
  weight?: number;
}

const EDGE_STYLES: Record<EdgeType, { stroke: string; dasharray?: string }> = {
  prerequisite_of: { stroke: "hsl(var(--primary))" },
  part_of: { stroke: "hsl(var(--muted-foreground))" },
  explored_from: { stroke: "hsl(45, 93%, 47%)", dasharray: "6 4" },
  confused_with: { stroke: "hsl(0, 84%, 60%)", dasharray: "4 4" },
};

export function TrailEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const edgeData = data as TrailEdgeData | undefined;
  const label = edgeData?.branch_topic;
  const edgeType = edgeData?.edgeType ?? "prerequisite_of";
  const weight = edgeData?.weight ?? 1.0;
  const style = EDGE_STYLES[edgeType];

  // Map weight (0-1) to opacity (0.15-0.9) — stronger relationships are more visible
  const opacity = 0.15 + weight * 0.75;
  // Stronger relationships get thicker lines too
  const strokeWidth = 1 + weight * 1.5;

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={style.dasharray}
        strokeOpacity={opacity}
      >
        {style.dasharray && (
          <animate
            attributeName="stroke-dashoffset"
            from="20"
            to="0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        )}
      </path>
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
