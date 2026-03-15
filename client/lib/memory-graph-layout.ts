import type { Node, Edge } from "@xyflow/react";
import { assignNearestHandles, runForceLayout } from "@/lib/graph-layout";

/**
 * Layout engine for the memory graph.
 *
 * Positions nodes in a hub-and-spoke pattern:
 *   - Hub node (mg_hub) pinned at center (0,0)
 *   - Concept nodes arranged in a circle around the hub
 *   - Facts/beliefs/people/resources placed near their linked concept
 *   - Unlinked nodes in an outer ring
 *
 * Then runs a D3 force simulation (via shared `runForceLayout`) to
 * resolve overlaps, and assigns nearest-side handles for edges.
 */

const NODE_WIDTH = 200;
const NODE_HEIGHT = 70;

export function layoutMemoryGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const hub = nodes.find((n) => n.type === "mg_hub");
  const concepts = nodes.filter((n) => n.type === "mg_concept");
  const others = nodes.filter((n) => n.type !== "mg_concept" && n.type !== "mg_hub");

  const positions = new Map<string, { x: number; y: number }>();

  // Hub at center
  if (hub) positions.set(hub.id, { x: 0, y: 0 });

  // Concepts in a circle around the hub
  const conceptRadius = Math.max(200, concepts.length * 30);
  concepts.forEach((c, i) => {
    const angle = (i / Math.max(1, concepts.length)) * 2 * Math.PI - Math.PI / 2;
    positions.set(c.id, {
      x: Math.cos(angle) * conceptRadius,
      y: Math.sin(angle) * conceptRadius,
    });
  });

  // Build a Map for O(1) node lookups (instead of nodes.find per edge)
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Figure out which non-concept nodes are linked to a concept
  const linkedConcept = new Map<string, string>();
  for (const e of edges) {
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    if (src?.type === "mg_concept" && tgt?.type !== "mg_concept") {
      linkedConcept.set(e.target, e.source);
    }
    if (tgt?.type === "mg_concept" && src?.type !== "mg_concept") {
      linkedConcept.set(e.source, e.target);
    }
  }

  // Place non-concept nodes near their parent concept, or in an outer ring
  const outerRadius = conceptRadius + 250;
  let outerIndex = 0;
  for (const n of others) {
    const parentPos = positions.get(linkedConcept.get(n.id) ?? "");
    if (parentPos) {
      // Deterministic spread based on index (avoids Math.random in useMemo)
      const spread = (outerIndex * 137.5 * Math.PI) / 180; // golden angle
      const dist = 90 + (outerIndex % 3) * 30;
      positions.set(n.id, {
        x: parentPos.x + Math.cos(spread) * dist,
        y: parentPos.y + Math.sin(spread) * dist,
      });
    } else {
      const angle = (outerIndex / Math.max(1, others.length)) * 2 * Math.PI;
      positions.set(n.id, {
        x: Math.cos(angle) * outerRadius,
        y: Math.sin(angle) * outerRadius,
      });
    }
    outerIndex++;
  }

  // Run shared force simulation (hub pinned at center)
  const layoutedNodes = runForceLayout(nodes, edges, positions, hub?.id, NODE_WIDTH, NODE_HEIGHT, {
    chargeStrength: -400,
    linkDistance: 180,
    linkStrength: 0.15,
    ticks: 80,
  });

  return {
    nodes: layoutedNodes,
    edges: assignNearestHandles(layoutedNodes, edges, NODE_WIDTH, NODE_HEIGHT),
  };
}
