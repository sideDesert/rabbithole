"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  useNodesState,
  useEdgesState,
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

function DomainFilter({
  domains,
  selected,
  onChange,
}: {
  domains: string[];
  selected: string | undefined;
  onChange: (domain: string | undefined) => void;
}) {
  if (domains.length < 2) return null;
  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="text-xs bg-card border border-border rounded-md px-2 py-1.5 text-foreground"
      >
        <option value="">All domains</option>
        {domains.map((d) => (
          <option key={d} value={d}>
            {d.replace(/-/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

function KnowledgeGraphInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const reactFlowInstance = useReactFlow();
  const focusParam = searchParams.get("focus");
  const [domainFilter, setDomainFilter] = useState<string | undefined>();
  const { data, isLoading, error, refetch } = useKnowledgeGraph(domainFilter);
  const [selectedConcept, setSelectedConcept] = useState<KnowledgeConcept | null>(null);
  const focusHandledRef = useRef(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  const layouted = useMemo(() => {
    if (!data?.nodes?.length) return { nodes: [] as Node[], edges: [] as Edge[] };

    const rfNodes: Node[] = data.nodes.map((c) => ({
      id: c.name,
      type: "concept",
      position: { x: 0, y: 0 },
      data: {
        name: c.name,
        mastery_score: c.mastery_score,
        strength_trend: c.strength_trend,
        domain: c.domain,
        source: c.source,
        confidence: c.confidence,
      },
    }));

    const rfEdges: Edge[] = data.edges.map((e) => ({
      id: `e-${e.source}-${e.target}-${e.type}`,
      source: e.source,
      target: e.target,
      type: "trail",
      data: { edgeType: e.type },
    }));

    return layoutGraph(rfNodes, rfEdges, { direction: "LR" });
  }, [data]);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  // Handle ?focus param after data loads
  useEffect(() => {
    if (focusParam && !focusHandledRef.current && data?.nodes && nodes.length > 0) {
      const target = data.nodes.find(
        (c) => c.name.toLowerCase() === focusParam.toLowerCase(),
      );
      if (target) {
        setSelectedConcept(target);
        const node = nodes.find(
          (n) => n.id.toLowerCase() === focusParam.toLowerCase(),
        );
        if (node) {
          requestAnimationFrame(() => {
            reactFlowInstance.setCenter(
              node.position.x + 125,
              node.position.y + 40,
              { zoom: 1.2, duration: 500 },
            );
          });
        }
      }
      focusHandledRef.current = true;
    }
  }, [focusParam, data, nodes, reactFlowInstance]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const concept = data?.nodes.find((c) => c.name === node.id);
      setSelectedConcept(concept ?? null);
    },
    [data],
  );

  const closePanel = useCallback(() => setSelectedConcept(null), []);

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

  if (!data?.nodes?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-muted-foreground">
        <Network className="size-10 opacity-40" />
        <p>Start a learning thread to build your knowledge map.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen">
      <DomainFilter
        domains={data.domains}
        selected={domainFilter}
        onChange={setDomainFilter}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView={!focusParam}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={20} size={1} className="!text-muted" />
        <Controls showInteractive={false} />
      </ReactFlow>

      <PreviewPanel open={!!selectedConcept} onClose={closePanel}>
        {selectedConcept && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">{selectedConcept.name}</h3>

            {selectedConcept.description && (
              <p className="text-xs text-muted-foreground">{selectedConcept.description}</p>
            )}

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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Domain</span>
                <span>{selectedConcept.domain.replace(/-/g, " ") || "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="capitalize">{selectedConcept.source}</span>
              </div>
              {selectedConcept.confidence < 1.0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confidence</span>
                  <span>{Math.round(selectedConcept.confidence * 100)}%</span>
                </div>
              )}
              {selectedConcept.last_reviewed && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last reviewed</span>
                  <span>{new Date(selectedConcept.last_reviewed).toLocaleDateString()}</span>
                </div>
              )}
              {selectedConcept.weak_subconcepts.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Weak areas:</span>
                  <ul className="mt-1 list-disc list-inside text-muted-foreground">
                    {selectedConcept.weak_subconcepts.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
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
    <Suspense>
      <ReactFlowProvider>
        <KnowledgeGraphInner />
      </ReactFlowProvider>
    </Suspense>
  );
}
