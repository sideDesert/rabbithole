"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
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
import { Brain, RefreshCw } from "lucide-react";

import { useMemoryGraph, useSyncMemoryGraph } from "@/hooks/use-memory-graph";
import { layoutMemoryGraph } from "@/lib/memory-graph-layout";
import { ConceptMgNode } from "@/components/memory-graph/concept-mg-node";
import { PersonNode } from "@/components/memory-graph/person-node";
import { FactNode } from "@/components/memory-graph/fact-node";
import { BeliefNode } from "@/components/memory-graph/belief-node";
import { ResourceNode } from "@/components/memory-graph/resource-node";
import { MemoryEdge } from "@/components/memory-graph/memory-edge";
import { MemoryHubNode } from "@/components/memory-graph/memory-hub-node";
import { PreviewPanel } from "@/components/graph/preview-panel";
import { MemoryPreviewContent } from "@/components/memory-graph/memory-preview-content";
import { ENTITY_COLORS } from "@/components/memory-graph/shared";
import { Button } from "@/components/ui/button";
import type { MemoryEntity, MemoryGraphStats } from "@/lib/api";

const nodeTypes: NodeTypes = {
  mg_hub: MemoryHubNode,
  mg_concept: ConceptMgNode,
  mg_person: PersonNode,
  mg_fact: FactNode,
  mg_belief: BeliefNode,
  mg_resource: ResourceNode,
};
const edgeTypes: EdgeTypes = { memory_edge: MemoryEdge };

const NODE_TYPE_MAP: Record<string, string> = {
  concept: "mg_concept",
  person: "mg_person",
  fact: "mg_fact",
  belief: "mg_belief",
  resource: "mg_resource",
};

function StatsBar({ stats }: { stats: MemoryGraphStats }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 bg-card/90 backdrop-blur-sm border border-border rounded-xl px-5 py-2.5 shadow-lg">
      <Stat label="Concepts" value={stats.concept_count} color="text-teal-400" />
      <Sep />
      <Stat label="People" value={stats.person_count} color="text-purple-400" />
      <Sep />
      <Stat label="Facts" value={stats.fact_count} color="text-blue-400" />
      <Sep />
      <Stat label="Beliefs" value={stats.belief_count} color="text-amber-400" />
      <Sep />
      <Stat label="Resources" value={stats.resource_count} color="text-slate-400" />
      <Sep />
      <Stat label="Edges" value={stats.relationship_count} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${color ?? "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-8 bg-border" />;
}

function FilterBar({
  entityTypes,
  domains,
  selectedType,
  selectedDomain,
  onTypeChange,
  onDomainChange,
}: {
  entityTypes: string[];
  domains: string[];
  selectedType: string | undefined;
  selectedDomain: string | undefined;
  onTypeChange: (v: string | undefined) => void;
  onDomainChange: (v: string | undefined) => void;
}) {
  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
      <select
        value={selectedType ?? ""}
        onChange={(e) => onTypeChange(e.target.value || undefined)}
        className="text-xs bg-card border border-border rounded-md px-2 py-1.5 text-foreground"
      >
        <option value="">All types</option>
        {entityTypes.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      {domains.length > 1 && (
        <select
          value={selectedDomain ?? ""}
          onChange={(e) => onDomainChange(e.target.value || undefined)}
          className="text-xs bg-card border border-border rounded-md px-2 py-1.5 text-foreground"
        >
          <option value="">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>{d.replace(/-/g, " ")}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function Legend() {
  const items = (Object.entries(ENTITY_COLORS) as [string, { border: string }][]).map(
    ([type, c]) => ({ label: type.charAt(0).toUpperCase() + type.slice(1), color: c.border }),
  );
  const edges = [
    { label: "part_of", color: "#2dd4bf", dash: false },
    { label: "led_to", color: "#fbbf24", dash: true },
    { label: "confused_with", color: "#f87171", dash: true },
    { label: "contradicts", color: "#ef4444", dash: false },
    { label: "derived_from", color: "#94a3b8", dash: true },
    { label: "learned_from", color: "#a78bfa", dash: false },
  ];
  return (
    <div className="absolute bottom-20 right-4 z-10 bg-card/90 backdrop-blur-sm border border-border rounded-xl p-3 shadow-lg">
      <p className="text-[10px] font-medium text-muted-foreground mb-2">Nodes</p>
      <div className="space-y-1 mb-3">
        {items.map((i) => (
          <div key={i.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ background: i.color }} />
            <span className="text-[10px] text-muted-foreground">{i.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-medium text-muted-foreground mb-2">Edges</p>
      <div className="space-y-1">
        {edges.map((e) => (
          <div key={e.label} className="flex items-center gap-2">
            <div
              className="w-4 h-0.5"
              style={{
                background: e.color,
                borderTop: e.dash ? `2px dashed ${e.color}` : `2px solid ${e.color}`,
              }}
            />
            <span className="text-[10px] text-muted-foreground">{e.label.replace(/_/g, " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MemoryGraphInner() {
  const { resolvedTheme } = useTheme();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [domainFilter, setDomainFilter] = useState<string | undefined>();
  const { data, isLoading, error, refetch } = useMemoryGraph(typeFilter, domainFilter);
  const syncMutation = useSyncMemoryGraph();
  const [selectedEntity, setSelectedEntity] = useState<MemoryEntity | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  const layouted = useMemo(() => {
    if (!data?.nodes?.length) return { nodes: [] as Node[], edges: [] as Edge[] };

    // Central hub node
    const hubNode: Node = {
      id: "__memory_hub__",
      type: "mg_hub",
      position: { x: 0, y: 0 },
      data: { name: "Memory" },
    };

    const entityNodes: Node[] = data.nodes.map((e) => ({
      id: e.slug,
      type: NODE_TYPE_MAP[e.type] ?? "mg_concept",
      position: { x: 0, y: 0 },
      data: {
        name: e.name,
        mastery: e.mastery,
        confidence: e.confidence,
        domain: e.domain,
        role: e.role,
        statement: e.statement,
        verified: e.verified,
        correct: e.correct,
        title: e.title,
        resource_type: e.resource_type,
      },
    }));

    const rfNodes: Node[] = [hubNode, ...entityNodes];

    // Edges from data + hub-to-concept edges
    const conceptSlugs = data.nodes.filter((n) => n.type === "concept").map((n) => n.slug);
    const hubEdges: Edge[] = conceptSlugs.map((slug) => ({
      id: `e-hub-${slug}`,
      source: "__memory_hub__",
      target: slug,
      type: "memory_edge",
      data: { edgeType: "part_of", weight: 0.6 },
    }));

    const dataEdges: Edge[] = data.edges.map((e) => ({
      id: `e-${e.source}-${e.target}-${e.type}`,
      source: e.source,
      target: e.target,
      type: "memory_edge",
      data: { edgeType: e.type, weight: e.weight },
    }));

    const rfEdges: Edge[] = [...hubEdges, ...dataEdges];

    return layoutMemoryGraph(rfNodes, rfEdges);
  }, [data]);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const entity = data?.nodes.find((e) => e.slug === node.id);
      setSelectedEntity(entity ?? null);
    },
    [data],
  );

  const closePanel = useCallback(() => setSelectedEntity(null), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="thinking-orb" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p>Failed to load memory graph.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (!data?.nodes?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Brain className="size-10 opacity-40" />
        <p>No memory data yet.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          Sync from EverMemOS
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <FilterBar
        entityTypes={data.entity_types}
        domains={data.domains}
        selectedType={typeFilter}
        selectedDomain={domainFilter}
        onTypeChange={setTypeFilter}
        onDomainChange={setDomainFilter}
      />

      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          Sync
        </Button>
      </div>

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
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={20} size={1} className="!text-muted" />
        <Controls showInteractive={false} />
      </ReactFlow>

      <Legend />
      <StatsBar stats={data.stats} />

      <PreviewPanel open={!!selectedEntity} onClose={closePanel}>
        {selectedEntity && <MemoryPreviewContent entity={selectedEntity} />}
      </PreviewPanel>
    </div>
  );
}

export default function MemoryGraphPage() {
  return (
    <Suspense>
      <ReactFlowProvider>
        <MemoryGraphInner />
      </ReactFlowProvider>
    </Suspense>
  );
}
