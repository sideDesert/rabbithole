import { getBezierPath, type EdgeProps } from "@xyflow/react";

type MemoryEdgeType = "part_of" | "led_to" | "confused_with" | "contradicts" | "derived_from" | "learned_from";

interface MemoryEdgeData {
  edgeType?: MemoryEdgeType;
  weight?: number;
}

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const EDGE_STYLES: Record<MemoryEdgeType, { cssVar: string; dasharray?: string }> = {
  part_of:       { cssVar: "--chart-5" },
  led_to:        { cssVar: "--secondary", dasharray: "6 4" },
  confused_with: { cssVar: "--primary", dasharray: "4 4" },
  contradicts:   { cssVar: "--destructive" },
  derived_from:  { cssVar: "--muted-foreground", dasharray: "2 3" },
  learned_from:  { cssVar: "--chart-4" },
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
  const config = EDGE_STYLES[edgeType];
  const stroke = getCSSVar(config.cssVar);

  const opacity = 0.3 + weight * 0.7;
  const strokeWidth = 1.5 + weight * 1.5;
  const animationDuration = `${2 + (1 - weight) * 2}s`;

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
        <animateMotion dur={animationDuration} repeatCount="indefinite" path={edgePath} />
      </circle>
    </g>
  );
}
