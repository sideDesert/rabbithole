import { getBezierPath, type EdgeProps } from "@xyflow/react";

type MemoryEdgeType = "part_of" | "led_to" | "confused_with" | "contradicts" | "derived_from" | "learned_from";

interface MemoryEdgeData {
  edgeType?: MemoryEdgeType;
  weight?: number;
}

const EDGE_STYLES: Record<MemoryEdgeType, { stroke: string; dasharray?: string }> = {
  part_of:       { stroke: "#88e5d6" },
  led_to:        { stroke: "#ffe156", dasharray: "6 4" },
  confused_with: { stroke: "#e85d3a", dasharray: "4 4" },
  contradicts:   { stroke: "#dc2626" },
  derived_from:  { stroke: "#999999", dasharray: "2 3" },
  learned_from:  { stroke: "#4a90d9" },
};

export function MemoryEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  const edgeData = data as MemoryEdgeData | undefined;
  const edgeType = edgeData?.edgeType ?? "part_of";
  const weight = edgeData?.weight ?? 1.0;
  const style = EDGE_STYLES[edgeType];

  const opacity = 0.3 + weight * 0.7;
  const strokeWidth = 1.5 + weight * 1.5;
  const animationDuration = `${2 + (1 - weight) * 2}s`;

  return (
    <g>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={style.dasharray}
        strokeOpacity={opacity * 0.5}
      />
      <circle r={strokeWidth} fill={style.stroke} opacity={opacity}>
        <animateMotion dur={animationDuration} repeatCount="indefinite" path={edgePath} />
      </circle>
    </g>
  );
}
