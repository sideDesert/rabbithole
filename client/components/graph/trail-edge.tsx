import { EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

type EdgeType = "prerequisite_of" | "part_of" | "explored_from" | "confused_with";

interface TrailEdgeData {
  branch_topic?: string | null;
  edgeType?: EdgeType;
}

const EDGE_STYLES: Record<EdgeType, { stroke: string; dasharray?: string; opacity: number }> = {
  prerequisite_of: { stroke: "hsl(var(--primary))", opacity: 0.8 },
  part_of: { stroke: "hsl(var(--muted-foreground))", opacity: 0.5 },
  explored_from: { stroke: "hsl(45, 93%, 47%)", dasharray: "6 4", opacity: 0.7 },
  confused_with: { stroke: "hsl(0, 84%, 60%)", dasharray: "4 4", opacity: 0.8 },
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
  const style = EDGE_STYLES[edgeType];

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.stroke}
        strokeWidth={2}
        strokeDasharray={style.dasharray}
        strokeOpacity={style.opacity}
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
