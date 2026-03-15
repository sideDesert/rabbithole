import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { Node, Edge } from "@xyflow/react";

interface LayoutOptions {
  direction?: "TB" | "LR";
  nodeWidth?: number;
  nodeHeight?: number;
}

interface ForceNode extends SimulationNodeDatum {
  id: string;
  nodeType?: string;
}

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
): { nodes: Node[]; edges: Edge[] } {
  const { nodeWidth = 250, nodeHeight = 80 } = options;

  if (nodes.length === 0) return { nodes, edges };

  const centerX = 600;
  const centerY = 400;

  // Build simulation nodes
  const simNodes: ForceNode[] = nodes.map((n) => ({
    id: n.id,
    nodeType: (n.data as Record<string, unknown>)?.node_type as string | undefined,
    x: centerX + (Math.random() - 0.5) * 1000,
    y: centerY + (Math.random() - 0.5) * 800,
  }));

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

  // Pin the memory hub to center
  const memHub = simNodes.find((n) => n.id === "rabbithole-memory");
  if (memHub) {
    memHub.fx = centerX;
    memHub.fy = centerY;
  }

  // Build simulation links — only include edges where both endpoints exist
  const simLinks: SimulationLinkDatum<ForceNode>[] = edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
    }));

  // Strong repulsion to prevent overlapping
  const chargeStrength = (d: ForceNode) => {
    if (d.id === "rabbithole-memory") return -3000;
    if (d.nodeType === "topic_hub") return -1500;
    if (d.nodeType === "thread") return -300;
    return -600;
  };

  // Large collision radius to create gaps between nodes
  const collisionRadius = (d: ForceNode) => {
    if (d.id === "rabbithole-memory") return 180;
    if (d.nodeType === "topic_hub") return 140;
    if (d.nodeType === "thread") return 60;
    return 90;
  };

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force(
      "link",
      forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
        .id((d) => d.id)
        .distance((link) => {
          const src = link.source as ForceNode;
          const tgt = link.target as ForceNode;
          // Longer distance for hub-to-hub, shorter for concept chains
          if (src.id === "rabbithole-memory" || tgt.id === "rabbithole-memory") return 450;
          if (src.nodeType === "topic_hub" || tgt.nodeType === "topic_hub") return 280;
          if (src.nodeType === "thread" || tgt.nodeType === "thread") return 200;
          return 150;
        })
        .strength(0.4),
    )
    .force("charge", forceManyBody<ForceNode>().strength(chargeStrength).distanceMax(800))
    .force("center", forceCenter(centerX, centerY).strength(0.05))
    .force("collide", forceCollide<ForceNode>().radius(collisionRadius).strength(1).iterations(3))
    .force("x", forceX(centerX).strength(0.02))
    .force("y", forceY(centerY).strength(0.02))
    .stop();

  // Run simulation — more iterations for better convergence
  for (let i = 0; i < 600; i++) {
    simulation.tick();
  }

  // Map positions back to React Flow nodes
  const layoutedNodes = nodes.map((node) => {
    const simNode = nodeMap.get(node.id);
    return {
      ...node,
      position: {
        x: (simNode?.x ?? 0) - nodeWidth / 2,
        y: (simNode?.y ?? 0) - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
