import { getBezierPath, type EdgeProps } from "@xyflow/react";

type EdgeType = "prerequisite_of" | "part_of" | "explored_from" | "confused_with";

interface TrailEdgeData {
  branch_topic?: string | null;
  edgeType?: EdgeType;
  weight?: number;
}

// Hardcoded colors — CSS variables don't work reliably in SVG stroke
const EDGE_STYLES: Record<EdgeType, { stroke: string; dasharray?: string }> = {
  prerequisite_of: { stroke: "#818cf8" },           // indigo-400 — visible on dark
  part_of:         { stroke: "#94a3b8" },           // slate-400
  explored_from:   { stroke: "#fbbf24", dasharray: "6 4" },  // amber-400
  confused_with:   { stroke: "#f87171", dasharray: "4 4" },  // red-400
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
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const edgeData = data as TrailEdgeData | undefined;
  const edgeType = edgeData?.edgeType ?? "prerequisite_of";
  const weight = edgeData?.weight ?? 1.0;
  const style = EDGE_STYLES[edgeType];

  // Weight → opacity (0.3 to 1.0) and thickness (1.5 to 3)
  const opacity = 0.3 + weight * 0.7;
  const strokeWidth = 1.5 + weight * 1.5;

  // Animated flowing dots to show direction instead of arrows
  const animationDuration = `${2 + (1 - weight) * 2}s`; // faster for stronger edges

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
        <animateMotion
          dur={animationDuration}
          repeatCount="indefinite"
          path={edgePath}
        />
      </circle>
    </g>
  );
}
