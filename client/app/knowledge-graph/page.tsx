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
import { TopicHubNode } from "@/components/graph/topic-hub-node";
import { MemoryHubNode } from "@/components/graph/memory-hub-node";
import { TrailEdge } from "@/components/graph/trail-edge";
import { PreviewPanel } from "@/components/graph/preview-panel";
import { Button } from "@/components/ui/button";
import type { KnowledgeConcept, GraphStats } from "@/lib/api";

const nodeTypes: NodeTypes = {
  concept: ConceptNode,
  topic_hub: TopicHubNode,
  memory_hub: MemoryHubNode,
};
const edgeTypes: EdgeTypes = { trail: TrailEdge };

/* ── Stats Bar ─────────────────────────────────────────────────────────── */

function StatsBar({ stats }: { stats: GraphStats }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 bg-card/90 backdrop-blur-sm border border-border rounded-xl px-5 py-2.5 shadow-lg">
      <Stat label="Concepts" value={stats.total_concepts} />
      <Sep />
      <Stat label="Mastered" value={stats.mastered} color="text-chart-1" />
      <Sep />
      <Stat label="In Progress" value={stats.in_progress} color="text-primary" />
      <Sep />
      <Stat label="Undiscovered" value={stats.undiscovered} color="text-muted-foreground" />
      <Sep />
      <Stat label="Topics" value={stats.domain_count} />
      <Sep />
      <Stat label="Connections" value={stats.edge_count} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-semibold tabular-nums ${color ?? "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-6 bg-border" />;
}

/* ── Edge Legend ────────────────────────────────────────────────────────── */

function EdgeLegend() {
  return (
    <div className="absolute top-4 right-4 z-10 bg-card/90 backdrop-blur-sm border border-border rounded-xl px-4 py-3 shadow-lg space-y-3">
      <div className="space-y-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Edges</p>
        <LegendItem color="#818cf8" label="Prerequisite" />
        <LegendItem color="#94a3b8" label="Part of" />
        <LegendItem color="#fbbf24" label="Explored from" dashed />
        <LegendItem color="#f87171" label="Confused with" dashed />
      </div>
      <div className="border-t border-border pt-2 space-y-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mastery</p>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: "hsl(0, 84%, 60%)" }} />
          <span className="text-[10px] text-muted-foreground">Weak</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: "hsl(45, 93%, 47%)" }} />
          <span className="text-[10px] text-muted-foreground">Medium</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: "hsl(142, 71%, 45%)" }} />
          <span className="text-[10px] text-muted-foreground">Mastered</span>
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground/60 italic">Opacity = relationship strength</p>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="24" height="8">
        <line
          x1="0" y1="4" x2="24" y2="4"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

/* ── Domain Filter ─────────────────────────────────────────────────────── */

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
    <div className="absolute top-4 left-4 z-10">
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="text-xs bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-2 text-foreground shadow-lg capitalize"
      >
        <option value="">All topics</option>
        {domains.map((d) => (
          <option key={d} value={d}>
            {d.replace(/-/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── Main Graph ────────────────────────────────────────────────────────── */

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

    const rfNodes: Node[] = data.nodes.map((c) => {
      let nodeType = "concept";
      if (c.node_type === "topic_hub") nodeType = "topic_hub";
      if (c.node_type === "memory_hub") nodeType = "memory_hub";

      return {
        id: c.name,
        type: nodeType,
        position: { x: 0, y: 0 },
        data: {
          name: c.name,
          node_type: c.node_type ?? "concept",
          display_name: c.display_name ?? c.name,
          mastery_score: c.mastery_score,
          strength_trend: c.strength_trend,
          domain: c.domain,
          source: c.source,
          confidence: c.confidence,
          concept_count: c.concept_count ?? 0,
          description: c.description ?? "",
        },
      };
    });

    const rfEdges: Edge[] = data.edges.map((e) => ({
      id: `e-${e.source}-${e.target}-${e.type}`,
      source: e.source,
      target: e.target,
      type: "trail",
      data: { edgeType: e.type, weight: e.weight },
    }));

    return layoutGraph(rfNodes, rfEdges, { direction: "LR" });
  }, [data]);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

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

      <EdgeLegend />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.05}
        maxZoom={2}
      >
        <svg>
          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#818cf8" fillOpacity="0.6" />
            </marker>
          </defs>
        </svg>
        <Background gap={20} size={1} className="!text-muted" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {data.stats && <StatsBar stats={data.stats} />}

      <PreviewPanel open={!!selectedConcept} onClose={closePanel}>
        {selectedConcept && (
          <div className="space-y-3">
            {selectedConcept.node_type === "topic_hub" ? (
              /* Topic hub preview */
              <div>
                <h3 className="font-semibold text-sm capitalize">
                  {selectedConcept.display_name ?? selectedConcept.domain.replace(/-/g, " ")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedConcept.concept_count} concepts | {Math.round(selectedConcept.mastery_score * 100)}% average mastery
                </p>
                {selectedConcept.threads.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground mb-1">Threads:</p>
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
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-3 text-xs"
                  onClick={() => setDomainFilter(selectedConcept.domain)}
                >
                  Filter to this topic
                </Button>
              </div>
            ) : (
              /* Concept preview */
              <div>
                <h3 className="font-semibold text-sm">{selectedConcept.name}</h3>

                {selectedConcept.description && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedConcept.description}</p>
                )}

                <div className="space-y-2 text-xs mt-3">
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
                    <span className="text-muted-foreground">Topic</span>
                    <span className="capitalize">{selectedConcept.domain.replace(/-/g, " ") || "\u2014"}</span>
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
                  <div className="pt-2">
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
