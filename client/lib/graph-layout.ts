import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
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

  // Detect mode: overview (has memory_hub) vs drill-in (no memory_hub)
  const hasMemoryHub = nodes.some(
    (n) => (n.data as Record<string, unknown>)?.node_type === "memory_hub",
  );

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

  // Separate node types
  const topicHubs = nodes.filter(
    (n) => (n.data as Record<string, unknown>)?.node_type === "topic_hub",
  );
  const threads = nodes.filter(
    (n) => (n.data as Record<string, unknown>)?.node_type === "thread",
  );
  const memoryHub = nodes.find(
    (n) => (n.data as Record<string, unknown>)?.node_type === "memory_hub",
  );

  // Build a map of topic_hub edges to find which threads connect to which hub
  const hubForThread = new Map<string, string>();
  for (const e of edges) {
    const srcNode = nodes.find((n) => n.id === e.source);
    const tgtNode = nodes.find((n) => n.id === e.target);
    if (
      srcNode &&
      (srcNode.data as Record<string, unknown>)?.node_type === "topic_hub" &&
      tgtNode &&
      (tgtNode.data as Record<string, unknown>)?.node_type === "thread"
    ) {
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
    // Find the angle from center to hub
    const hubAngle = Math.atan2(hubPos.y - cy, hubPos.x - cx);
    const spreadAngle = Math.PI * 0.4; // spread threads in a 72° arc around hub
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

  const layoutedNodes = nodes.map((node) => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0 };
    return {
      ...node,
      position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 },
    };
  });

  return { nodes: layoutedNodes, edges };
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

  // Find the topic hub — pin it to center
  const topicHub = nodes.find(
    (n) => (n.data as Record<string, unknown>)?.node_type === "topic_hub",
  );
  const concepts = nodes.filter(
    (n) => (n.data as Record<string, unknown>)?.node_type === "concept",
  );
  const threads = nodes.filter(
    (n) => (n.data as Record<string, unknown>)?.node_type === "thread",
  );

  const positions = new Map<string, { x: number; y: number }>();

  // Topic hub at center
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

  // Now run a short force simulation to untangle edges
  const simNodes: ForceNode[] = nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    const nodeType = (n.data as Record<string, unknown>)?.node_type as string | undefined;
    const sn: ForceNode = { id: n.id, nodeType, x: pos.x, y: pos.y };
    if (topicHub && n.id === topicHub.id) {
      sn.fx = cx;
      sn.fy = cy;
    }
    return sn;
  });

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

  const simLinks: SimulationLinkDatum<ForceNode>[] = edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force(
      "link",
      forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
        .id((d) => d.id)
        .distance(180)
        .strength(0.15),
    )
    .force("charge", forceManyBody<ForceNode>().strength(-400))
    .force(
      "collide",
      forceCollide<ForceNode>()
        .radius(85)
        .strength(1)
        .iterations(4),
    )
    .stop();

  for (let i = 0; i < 300; i++) {
    simulation.tick();
  }

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
