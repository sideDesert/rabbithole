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

interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
}

interface ForceNode extends SimulationNodeDatum {
  id: string;
}

interface ForceParams {
  chargeStrength: number;
  linkDistance: number;
  linkStrength: number;
  ticks: number;
}

/* ── Shared helpers ──────────────────────────────────────────────────── */

/** For each edge, pick the source/target handles on the sides closest to each other. */
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

/** Run a D3 force simulation to resolve overlaps, returning positioned nodes. */
function runForceLayout(
  nodes: Node[],
  edges: Edge[],
  positions: Map<string, { x: number; y: number }>,
  pinnedId: string | undefined,
  nodeWidth: number,
  nodeHeight: number,
  params: ForceParams,
): Node[] {
  const simNodes: ForceNode[] = nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    const sn: ForceNode = { id: n.id, x: pos.x, y: pos.y };
    if (n.id === pinnedId) {
      sn.fx = pos.x;
      sn.fy = pos.y;
    }
    return sn;
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
        .distance(params.linkDistance)
        .strength(params.linkStrength),
    )
    .force("charge", forceManyBody<ForceNode>().strength(params.chargeStrength))
    .force(
      "collide",
      forceCollide<ForceNode>()
        .radius(collideRadius)
        .strength(1)
        .iterations(4),
    )
    .stop();

  for (let i = 0; i < params.ticks; i++) {
    simulation.tick();
  }

  return nodes.map((node) => {
    const simNode = nodeMap.get(node.id);
    return {
      ...node,
      position: {
        x: (simNode?.x ?? 0) - nodeWidth / 2,
        y: (simNode?.y ?? 0) - nodeHeight / 2,
      },
    };
  });
}

/* ── Public API ──────────────────────────────────────────────────────── */

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
): { nodes: Node[]; edges: Edge[] } {
  const { nodeWidth = 250, nodeHeight = 80 } = options;

  if (nodes.length === 0) return { nodes, edges };

  const hasMemoryHub = nodes.some((n) => n.type === "memory_hub");

  if (hasMemoryHub) {
    return layoutOverview(nodes, edges, nodeWidth, nodeHeight);
  }
  return layoutDrillIn(nodes, edges, nodeWidth, nodeHeight);
}

/* ── Overview: memory hub + topic hubs + threads ─────────────────────── */

function layoutOverview(
  nodes: Node[],
  edges: Edge[],
  nodeWidth: number,
  nodeHeight: number,
): { nodes: Node[]; edges: Edge[] } {
  const cx = 0;
  const cy = 0;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const topicHubs = nodes.filter((n) => n.type === "topic_hub");
  const threads = nodes.filter((n) => n.type === "thread");
  const memoryHub = nodes.find((n) => n.type === "memory_hub");

  // Build a map of topic_hub edges to find which threads connect to which hub
  const hubForThread = new Map<string, string>();
  for (const e of edges) {
    const srcNode = nodeById.get(e.source);
    const tgtNode = nodeById.get(e.target);
    if (srcNode?.type === "topic_hub" && tgtNode?.type === "thread") {
      hubForThread.set(e.target, e.source);
    }
  }

  const positions = new Map<string, { x: number; y: number }>();

  // Memory hub at center
  if (memoryHub) {
    positions.set(memoryHub.id, { x: cx, y: cy });
  }

  // Topic hubs in a circle
  const hubRadius = Math.max(350, topicHubs.length * 45);
  topicHubs.forEach((hub, i) => {
    const angle = (i / topicHubs.length) * 2 * Math.PI - Math.PI / 2;
    positions.set(hub.id, {
      x: cx + Math.cos(angle) * hubRadius,
      y: cy + Math.sin(angle) * hubRadius,
    });
  });

  // Threads near their topic hub, offset outward
  const threadsByHub = new Map<string, Node[]>();
  const unattachedThreads: Node[] = [];
  for (const t of threads) {
    const hubId = hubForThread.get(t.id);
    if (hubId) {
      if (!threadsByHub.has(hubId)) threadsByHub.set(hubId, []);
      threadsByHub.get(hubId)!.push(t);
    } else {
      unattachedThreads.push(t);
    }
  }

  for (const [hubId, hubThreads] of threadsByHub) {
    const hubPos = positions.get(hubId);
    if (!hubPos) continue;
    const hubAngle = Math.atan2(hubPos.y - cy, hubPos.x - cx);
    const spreadAngle = Math.PI * 0.4;
    hubThreads.forEach((t, i) => {
      const offset =
        hubThreads.length === 1
          ? 0
          : ((i / (hubThreads.length - 1)) - 0.5) * spreadAngle;
      const angle = hubAngle + offset;
      const dist = 140 + i * 20;
      positions.set(t.id, {
        x: hubPos.x + Math.cos(angle) * dist,
        y: hubPos.y + Math.sin(angle) * dist,
      });
    });
  }

  // Unattached threads in an outer ring
  unattachedThreads.forEach((t, i) => {
    const angle = (i / Math.max(1, unattachedThreads.length)) * 2 * Math.PI;
    const dist = hubRadius + 250;
    positions.set(t.id, {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
    });
  });

  const layoutedNodes = runForceLayout(nodes, edges, positions, memoryHub?.id, nodeWidth, nodeHeight, {
    chargeStrength: -300,
    linkDistance: 200,
    linkStrength: 0.1,
    ticks: 60,
  });

  return { nodes: layoutedNodes, edges: assignNearestHandles(layoutedNodes, edges, nodeWidth, nodeHeight) };
}

/* ── Drill-in: topic hub + concepts + threads ────────────────────────── */

function layoutDrillIn(
  nodes: Node[],
  edges: Edge[],
  nodeWidth: number,
  nodeHeight: number,
): { nodes: Node[]; edges: Edge[] } {
  const cx = 0;
  const cy = 0;

  const topicHub = nodes.find((n) => n.type === "topic_hub");
  const concepts = nodes.filter((n) => n.type === "concept");
  const threads = nodes.filter((n) => n.type === "thread");

  const positions = new Map<string, { x: number; y: number }>();

  if (topicHub) {
    positions.set(topicHub.id, { x: cx, y: cy });
  }

  // Concepts in concentric circles around the hub
  const conceptRadius = Math.max(300, concepts.length * 18);
  const conceptsPerRing = Math.max(8, Math.ceil(Math.sqrt(concepts.length) * 2.5));
  concepts.forEach((c, i) => {
    const ring = Math.floor(i / conceptsPerRing);
    const indexInRing = i % conceptsPerRing;
    const nodesInThisRing = Math.min(conceptsPerRing, concepts.length - ring * conceptsPerRing);
    const angle = (indexInRing / nodesInThisRing) * 2 * Math.PI - Math.PI / 2;
    const r = conceptRadius * 0.5 + ring * 200;
    positions.set(c.id, {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  });

  // Threads in a separate ring outside concepts
  if (threads.length > 0) {
    const outerRadius = conceptRadius + 200;
    threads.forEach((t, i) => {
      const angle = (i / threads.length) * 2 * Math.PI - Math.PI / 4;
      positions.set(t.id, {
        x: cx + Math.cos(angle) * outerRadius,
        y: cy + Math.sin(angle) * outerRadius,
      });
    });
  }

  const layoutedNodes = runForceLayout(nodes, edges, positions, topicHub?.id, nodeWidth, nodeHeight, {
    chargeStrength: -500,
    linkDistance: 200,
    linkStrength: 0.15,
    ticks: 80,
  });

  return { nodes: layoutedNodes, edges: assignNearestHandles(layoutedNodes, edges, nodeWidth, nodeHeight) };
}
