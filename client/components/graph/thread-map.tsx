"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Network } from "lucide-react";

import { useThreadMap } from "@/hooks/use-thread-map";
import { layoutGraph } from "@/lib/graph-layout";
import { ThreadNode } from "./thread-node";
import { TrailEdge } from "./trail-edge";
import { PreviewPanel } from "./preview-panel";
import { Button } from "@/components/ui/button";
import type { ThreadMapNode } from "@/lib/api";

const nodeTypes: NodeTypes = { thread: ThreadNode };
const edgeTypes: EdgeTypes = { trail: TrailEdge };

function ThreadMapInner({ threadId }: { threadId: string }) {
  const { data, isLoading, error, refetch } = useThreadMap(threadId);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [selectedNode, setSelectedNode] = useState<ThreadMapNode | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Compute layout when data changes, then push into draggable state
  const layouted = useMemo(() => {
    if (!data?.nodes?.length) return { nodes: [] as Node[], edges: [] as Edge[] };

    const rfNodes: Node[] = data.nodes.map((n) => ({
      id: n.thread_id,
      type: "thread",
      position: { x: 0, y: 0 },
      data: {
        title: n.title,
        phase: n.phase,
        depth: n.depth,
        current_concept: n.current_concept,
        status: n.status,
        progress: n.progress,
      },
    }));

    const rfEdges: Edge[] = data.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      type: "trail",
      data: { branch_topic: e.branch_topic },
    }));

    return layoutGraph(rfNodes, rfEdges, { direction: "LR" });
  }, [data]);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const mapNode = data?.nodes.find((n) => n.thread_id === node.id);
      setSelectedNode(mapNode ?? null);
    },
    [data],
  );

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
        <p>Failed to load thread map.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (!data?.nodes?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Network className="size-10 opacity-40" />
        <p>No thread data available.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
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
        minZoom={0.3}
        maxZoom={2}
      >
        <Background gap={20} size={1} className="!text-muted" />
        <Controls showInteractive={false} />
      </ReactFlow>

      <PreviewPanel open={!!selectedNode} onClose={() => setSelectedNode(null)}>
        {selectedNode && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">{selectedNode.title}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">{selectedNode.phase}</span>
              <span>&middot;</span>
              <span className="capitalize">{selectedNode.status}</span>
            </div>
            {selectedNode.summary && (
              <p className="text-xs text-muted-foreground">{selectedNode.summary}</p>
            )}
            {selectedNode.current_concept && (
              <p className="text-xs">
                <span className="text-muted-foreground">Current: </span>
                {selectedNode.current_concept}
              </p>
            )}
            {selectedNode.progress !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{Math.round(selectedNode.progress * 100)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(selectedNode.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => router.push(`/threads/${selectedNode.thread_id}`)}
              >
                Go to chat
              </Button>
              {selectedNode.current_concept && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() =>
                    router.push(
                      `/knowledge-graph?focus=${encodeURIComponent(selectedNode.current_concept!)}`,
                    )
                  }
                >
                  View in Knowledge Graph
                </Button>
              )}
            </div>
          </div>
        )}
      </PreviewPanel>

      {data.nodes.length === 1 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-card/80 backdrop-blur px-3 py-1.5 rounded-full border border-border">
          No branches yet — explore a sub-topic to grow the tree
        </div>
      )}
    </div>
  );
}

export function ThreadMap({ threadId }: { threadId: string }) {
  return (
    <ReactFlowProvider>
      <ThreadMapInner threadId={threadId} />
    </ReactFlowProvider>
  );
}
