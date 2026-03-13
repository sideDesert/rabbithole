import { EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

interface TrailEdgeData {
  branch_topic?: string | null;
}

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

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={2}
        strokeDasharray="6 4"
        strokeOpacity={0.6}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="20"
          to="0"
          dur="1.5s"
          repeatCount="indefinite"
        />
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
