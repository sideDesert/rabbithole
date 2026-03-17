import { getBezierPath, type EdgeProps } from "@xyflow/react";
import { useRef } from "react";

type EdgeType = "prerequisite_of" | "part_of" | "explored_from" | "confused_with";

interface TrailEdgeData {
  branch_topic?: string | null;
  edgeType?: EdgeType;
  weight?: number;
}

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Fallbacks in case getComputedStyle returns empty
const EDGE_STYLE_VARS: Record<EdgeType, { cssVar: string; fallback: string; dasharray?: string }> = {
  prerequisite_of: { cssVar: "--graph-edge-gold", fallback: "#000000" },
  part_of:         { cssVar: "",                  fallback: "#999999" },
  explored_from:   { cssVar: "--graph-edge-yellow", fallback: "#000000", dasharray: "6 4" },
  confused_with:   { cssVar: "",                    fallback: "#e85d3a", dasharray: "4 4" },
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
  const config = EDGE_STYLE_VARS[edgeType];

  const stroke = config.cssVar ? (getCSSVar(config.cssVar) || config.fallback) : config.fallback;

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
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={config.dasharray}
        strokeOpacity={opacity * 0.5}
      />
      <circle r={strokeWidth} fill={stroke} opacity={opacity}>
        <animateMotion
          dur={animationDuration}
          repeatCount="indefinite"
          path={edgePath}
        />
      </circle>
    </g>
  );
}
