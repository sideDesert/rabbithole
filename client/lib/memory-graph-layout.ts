import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { Node, Edge } from "@xyflow/react";
import { HANDLE_ID } from "@/components/graph/node-handles";

interface ForceNode extends SimulationNodeDatum {
  id: string;
}

function assignNearestHandles(
  nodes: Node[],
  edges: Edge[],
  nodeWidth: number,
  nodeHeight: number,
): Edge[] {
  const posMap = new Map<string, { cx: number; cy: number }>();
  for (const n of nodes) {
    posMap.set(n.id, {
      cx: n.position.x + nodeWidth / 2,
      cy: n.position.y + nodeHeight / 2,
    });
  }
  return edges.map((edge) => {
    const src = posMap.get(edge.source);
    const tgt = posMap.get(edge.target);
    if (!src || !tgt) return edge;
    const dx = tgt.cx - src.cx;
    const dy = tgt.cy - src.cy;
    if (Math.abs(dx) > Math.abs(dy)) {
      return {
        ...edge,
        sourceHandle: dx > 0 ? HANDLE_ID.sourceRight : HANDLE_ID.sourceLeft,
        targetHandle: dx > 0 ? HANDLE_ID.targetLeft : HANDLE_ID.targetRight,
      };
    }
    return {
      ...edge,
      sourceHandle: dy > 0 ? HANDLE_ID.sourceBottom : HANDLE_ID.sourceTop,
      targetHandle: dy > 0 ? HANDLE_ID.targetTop : HANDLE_ID.targetBottom,
    };
  });
}

export function layoutMemoryGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const nodeWidth = 200;
  const nodeHeight = 70;

  const concepts = nodes.filter((n) => n.type === "mg_concept");
  const others = nodes.filter((n) => n.type !== "mg_concept");

  const positions = new Map<string, { x: number; y: number }>();

  const conceptRadius = Math.max(200, concepts.length * 30);
  concepts.forEach((c, i) => {
    const angle = (i / Math.max(1, concepts.length)) * 2 * Math.PI - Math.PI / 2;
    positions.set(c.id, {
      x: Math.cos(angle) * conceptRadius,
      y: Math.sin(angle) * conceptRadius,
    });
  });

  const conceptPositions = new Map(positions);
  const linkedConcept = new Map<string, string>();
  for (const e of edges) {
    const srcNode = nodes.find((n) => n.id === e.source);
    const tgtNode = nodes.find((n) => n.id === e.target);
    if (srcNode?.type === "mg_concept" && tgtNode?.type !== "mg_concept") {
      linkedConcept.set(e.target, e.source);
    }
    if (tgtNode?.type === "mg_concept" && srcNode?.type !== "mg_concept") {
      linkedConcept.set(e.source, e.target);
    }
  }

  const outerRadius = conceptRadius + 250;
  let outerIndex = 0;
  for (const n of others) {
    const parentId = linkedConcept.get(n.id);
    const parentPos = parentId ? conceptPositions.get(parentId) : undefined;
    if (parentPos) {
      const jitter = (Math.random() - 0.5) * 120;
      positions.set(n.id, {
        x: parentPos.x + 100 + jitter,
        y: parentPos.y + 80 + jitter,
      });
    } else {
      const angle = (outerIndex / Math.max(1, others.length)) * 2 * Math.PI;
      positions.set(n.id, {
        x: Math.cos(angle) * outerRadius,
        y: Math.sin(angle) * outerRadius,
      });
      outerIndex++;
    }
  }

  const simNodes: ForceNode[] = nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return { id: n.id, x: pos.x, y: pos.y };
  });

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const simLinks: SimulationLinkDatum<ForceNode>[] = edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const collideRadius = Math.max(nodeWidth, nodeHeight) / 2 + 20;

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force(
      "link",
      forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
        .id((d) => d.id)
        .distance(180)
        .strength(0.15),
    )
    .force("charge", forceManyBody<ForceNode>().strength(-400))
    .force("collide", forceCollide<ForceNode>().radius(collideRadius).strength(1).iterations(4))
    .stop();

  for (let i = 0; i < 80; i++) simulation.tick();

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

  return { nodes: layoutedNodes, edges: assignNearestHandles(layoutedNodes, edges, nodeWidth, nodeHeight) };
}
