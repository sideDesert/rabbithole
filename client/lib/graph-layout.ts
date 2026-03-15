import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { Node, Edge } from "@xyflow/react";

interface LayoutOptions {
  direction?: "TB" | "LR"; // kept for API compat, ignored by force layout
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

  // Build simulation nodes
  const simNodes: ForceNode[] = nodes.map((n) => ({
    id: n.id,
    nodeType: (n.data as Record<string, unknown>)?.node_type as string | undefined,
    x: Math.random() * 800,
    y: Math.random() * 600,
  }));

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

  // Build simulation links — only include edges where both endpoints exist
  const simLinks: SimulationLinkDatum<ForceNode>[] = edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
    }));

  // Hub nodes get stronger charge (push others away more)
  const chargeStrength = (d: ForceNode) => {
    if (d.id === "rabbithole-memory") return -600;
    if (d.nodeType === "topic_hub") return -400;
    return -200;
  };

  // Collision radius based on node type
  const collisionRadius = (d: ForceNode) => {
    if (d.id === "rabbithole-memory") return 100;
    if (d.nodeType === "topic_hub") return 80;
    return 50;
  };

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force(
      "link",
      forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
        .id((d) => d.id)
        .distance(120)
        .strength(0.5),
    )
    .force("charge", forceManyBody<ForceNode>().strength(chargeStrength))
    .force("center", forceCenter(400, 300))
    .force("collide", forceCollide<ForceNode>().radius(collisionRadius).strength(0.8))
    .stop();

  // Run simulation synchronously
  const iterations = 300;
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
