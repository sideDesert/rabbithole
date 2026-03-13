"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { Network } from "lucide-react";

import { useKnowledgeGraph } from "@/hooks/use-knowledge-graph";
import { layoutGraph } from "@/lib/graph-layout";
import { ConceptNode } from "@/components/graph/concept-node";
import { TrailEdge } from "@/components/graph/trail-edge";
import { PreviewPanel } from "@/components/graph/preview-panel";
import { Button } from "@/components/ui/button";
import type { KnowledgeConcept } from "@/lib/api";

const nodeTypes: NodeTypes = { concept: ConceptNode };
const edgeTypes: EdgeTypes = { trail: TrailEdge };

function KnowledgeGraphInner() {
  const { data, isLoading, error, refetch } = useKnowledgeGraph();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const reactFlowInstance = useReactFlow();
  const focusParam = searchParams.get("focus");
  const [selectedConcept, setSelectedConcept] = useState<KnowledgeConcept | null>(null);
  const [focusHandled, setFocusHandled] = useState(false);

  const { nodes, edges } = useMemo(() => {
    if (!data?.concepts?.length) return { nodes: [] as Node[], edges: [] as Edge[] };

    const rfNodes: Node[] = data.concepts.map((c) => ({
      id: c.name,
      type: "concept",
      position: { x: 0, y: 0 },
      data: {
        name: c.name,
        mastery_score: c.mastery_score,
        strength_trend: c.strength_trend,
      },
    }));

    const rfEdges: Edge[] = data.prerequisites.map((p, i) => ({
      id: `e-${i}`,
      source: p.source,
      target: p.target,
      type: "trail",
    }));

    return layoutGraph(rfNodes, rfEdges, { direction: "LR" });
  }, [data]);

  const onInit = useCallback(() => {
    if (focusParam && !focusHandled && data?.concepts) {
      const target = data.concepts.find(
        (c) => c.name.toLowerCase() === focusParam.toLowerCase(),
      );
      if (target) {
        setSelectedConcept(target);
        setTimeout(() => {
          const node = nodes.find(
            (n) => n.id.toLowerCase() === focusParam.toLowerCase(),
          );
          if (node) {
            reactFlowInstance.setCenter(
              node.position.x + 100,
              node.position.y + 40,
              { zoom: 1.2, duration: 500 },
            );
          }
        }, 100);
      }
      setFocusHandled(true);
    }
  }, [focusParam, focusHandled, data, nodes, reactFlowInstance]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const concept = data?.concepts.find((c) => c.name === node.id);
      setSelectedConcept(concept ?? null);
    },
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="thinking-orb" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-muted-foreground">
        <p>Failed to load knowledge graph.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (!data?.concepts?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-muted-foreground">
        <Network className="size-10 opacity-40" />
        <p>Start a learning thread to build your knowledge map.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onInit={onInit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView={!focusParam}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={20} size={1} className="!text-muted" />
        <Controls showInteractive={false} />
      </ReactFlow>

      <PreviewPanel open={!!selectedConcept} onClose={() => setSelectedConcept(null)}>
        {selectedConcept && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">{selectedConcept.name}</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mastery</span>
                <span>{Math.round(selectedConcept.mastery_score * 100)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(selectedConcept.mastery_score * 100)}%` }}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trend</span>
                <span className="capitalize">{selectedConcept.strength_trend}</span>
              </div>
              {selectedConcept.last_reviewed && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last reviewed</span>
                  <span>{new Date(selectedConcept.last_reviewed).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            {selectedConcept.threads.length > 0 && (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-1">Covered in:</p>
                <div className="flex flex-col gap-1">
                  {selectedConcept.threads.map((tid) => (
                    <Button
                      key={tid}
                      size="sm"
                      variant="ghost"
                      className="text-xs justify-start h-7"
                      onClick={() => router.push(`/threads/${tid}`)}
                    >
                      Go to thread
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PreviewPanel>
    </div>
  );
}

export default function KnowledgeGraphPage() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner />
    </ReactFlowProvider>
  );
}
