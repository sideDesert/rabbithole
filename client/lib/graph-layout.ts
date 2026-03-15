import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceRadial,
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

  const centerX = 0;
  const centerY = 0;

  const nodeCount = nodes.length;
  // Scale the initial spread based on node count
  const spread = Math.max(800, nodeCount * 12);

  // Build simulation nodes — spread out initial positions
  const simNodes: ForceNode[] = nodes.map((n, i) => {
    const nodeType = (n.data as Record<string, unknown>)?.node_type as string | undefined;
    // Place nodes in a circle initially for better convergence
    const angle = (i / nodeCount) * 2 * Math.PI;
    const radius = nodeType === "topic_hub" ? spread * 0.4 : spread * 0.3 + Math.random() * spread * 0.4;
    return {
      id: n.id,
      nodeType,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });

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

  // Repulsion — stronger for hubs, no distance cap
  const chargeStrength = (d: ForceNode) => {
    if (d.id === "rabbithole-memory") return -4000;
    if (d.nodeType === "topic_hub") return -2000;
    if (d.nodeType === "thread") return -500;
    return -800;
  };

  // Collision radius — must exceed half the node width to prevent overlap
  const collisionRadius = (d: ForceNode) => {
    if (d.id === "rabbithole-memory") return 100;
    if (d.nodeType === "topic_hub") return 90;
    if (d.nodeType === "thread") return 70;
    return 80;
  };

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force(
      "link",
      forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
        .id((d) => d.id)
        .distance((link) => {
          const src = link.source as ForceNode;
          const tgt = link.target as ForceNode;
          if (src.id === "rabbithole-memory" || tgt.id === "rabbithole-memory") return 400;
          if (src.nodeType === "topic_hub" || tgt.nodeType === "topic_hub") return 250;
          if (src.nodeType === "thread" || tgt.nodeType === "thread") return 180;
          return 120;
        })
        .strength(0.3),
    )
    .force("charge", forceManyBody<ForceNode>().strength(chargeStrength))
    .force("collide", forceCollide<ForceNode>().radius(collisionRadius).strength(1).iterations(4))
    // Gentle radial force keeps topic hubs orbiting the center
    .force("radial", forceRadial<ForceNode>(
      (d) => {
        if (d.id === "rabbithole-memory") return 0;
        if (d.nodeType === "topic_hub") return spread * 0.35;
        return spread * 0.5;
      },
      centerX,
      centerY,
    ).strength((d) => {
      if (d.id === "rabbithole-memory") return 0;
      if (d.nodeType === "topic_hub") return 0.15;
      return 0.03;
    }))
    .stop();

  // Run simulation
  const iterations = Math.min(800, 300 + nodeCount * 2);
  for (let i = 0; i < iterations; i++) {
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
