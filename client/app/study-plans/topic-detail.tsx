"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tree, type NodeRendererProps } from "react-arborist";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  GitBranch,
  MessageSquare,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { phaseLabel } from "@/lib/topic-utils";
import {
  getProgress,
  type StudyTopic,
  type PlanPhase,
  type ThreadTreeNode,
} from "@/lib/api";
import { useThreadTree } from "@/hooks/use-thread-tree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function ProgressRing({
  progress,
  size = 48,
  strokeWidth = 5,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const deg = Math.round(progress * 360);
  return (
    <div
      className="rounded-full shrink-0 transition-all duration-500"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--primary) ${deg}deg, oklch(from var(--primary) l c h / 0.6) ${deg}deg)`,
        mask: `radial-gradient(farthest-side, transparent calc(50% - ${strokeWidth}px), #000 calc(50% - ${strokeWidth - 1}px), #000 50%, transparent 51%)`,
        WebkitMask: `radial-gradient(farthest-side, transparent calc(50% - ${strokeWidth}px), #000 calc(50% - ${strokeWidth - 1}px), #000 50%, transparent 51%)`,
      }}
    />
  );
}

function PhaseGroup({
  phase,
  currentConcept,
  defaultOpen = true,
}: {
  phase: PlanPhase;
  currentConcept: string | null;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const completed = phase.concepts.filter((c) => c.completed).length;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <button
        type="button"
        className="flex items-center justify-between w-full mb-2 group cursor-pointer"
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="flex items-center gap-1.5">
          {isOpen ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">{phase.title}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {completed}/{phase.concepts.length}
        </span>
      </button>
      {isOpen && (
        <div className="flex flex-col gap-1 ml-5">
          {phase.concepts.map((concept) => {
            const isCurrent = currentConcept && concept.name === currentConcept;
            return (
              <div
                key={concept.name}
                className={cn(
                  "flex items-center gap-2 py-1 px-2 rounded text-sm",
                  isCurrent
                    ? "bg-primary/10 text-foreground"
                    : concept.completed
                      ? "text-muted-foreground"
                      : "text-foreground",
                )}
              >
                {concept.completed ? (
                  <Check className="size-3.5 shrink-0 text-primary" />
                ) : (
                  <Circle
                    className={cn(
                      "size-3.5 shrink-0",
                      isCurrent ? "text-primary" : "text-muted-foreground/50",
                    )}
                  />
                )}
                <span className={concept.completed ? "line-through" : ""}>
                  {concept.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThreadNode({ node, style }: NodeRendererProps<ThreadTreeNode>) {
  const router = useRouter();
  const isRoot = node.level === 0;

  return (
    <div
      style={style}
      className={cn(
        "group/node flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-sm",
        "hover:bg-muted hover:text-foreground",
      )}
      onClick={() => router.push(`/threads/${node.data.thread_id}`)}
    >
      {node.isLeaf ? (
        <span className="w-4 shrink-0" />
      ) : (
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted-foreground/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
        >
          {node.isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      )}
      {isRoot ? <MessageSquare className="h-3.5 w-3.5 shrink-0" /> : <GitBranch className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate flex-1">{node.data.title}</span>
    </div>
  );
}

function countNodes(nodes: ThreadTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

export function TopicDetail({
  topic,
  onBack,
}: {
  topic: StudyTopic;
  onBack: () => void;
}) {
  const {
    data: progress,
    isLoading: progressLoading,
    error: progressError,
    refetch: refetchProgress,
  } = useQuery({
    queryKey: ["progress", topic.root_thread_id],
    queryFn: () => getProgress(topic.root_thread_id),
  });

  const { trees, isLoading: treesLoading } = useThreadTree();

  const topicTree = trees.find((t) => t.thread_id === topic.root_thread_id);
  const treeData = topicTree ? [topicTree] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-2">
          <ArrowLeft className="size-4 mr-1" /> All Study Plans
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold truncate">{topic.topic}</h1>
              <Badge variant="secondary">{phaseLabel(topic.phase)}</Badge>
            </div>
            {topic.current_concept && (
              <p className="text-sm text-muted-foreground">
                Currently on: {topic.current_concept}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <ProgressRing progress={topic.progress} />
            <Link href={`/threads/${topic.latest_thread.id}`}>
              <Button>
                Continue <ArrowRight className="ml-1 size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Plan Progress */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Study Plan</h2>
        {progressLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-5 w-36 mt-4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : progressError ? (
          <div className="rounded-lg border border-border p-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Failed to load plan progress.</span>
            <Button variant="ghost" size="sm" onClick={() => refetchProgress()}>
              Retry
            </Button>
          </div>
        ) : !progress?.phases?.length ? (
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Plan not yet created. Complete the interview to generate a study plan.
          </div>
        ) : (
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <span className="text-sm font-medium text-muted-foreground">Progress</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {progress.phases.reduce((s, p) => s + p.concepts.filter((c) => c.completed).length, 0)}/
                {progress.phases.reduce((s, p) => s + p.concepts.length, 0)} concepts
              </span>
            </div>
            <div className="divide-y divide-border">
              {progress.phases.map((phase) => (
                <PhaseGroup
                  key={phase.order}
                  phase={phase}
                  currentConcept={progress.current_concept}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Mastery & Tests Placeholder */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Tests</h2>
        <div className="rounded-lg border border-dashed border-border p-6 flex flex-col items-center justify-center text-center">
          <FlaskConical className="size-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            Mastery tests coming soon. You&apos;ll be able to track Feynman test scores for each concept here.
          </p>
        </div>
      </section>

      {/* Thread Tree */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Conversations</h2>
        {treesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-40 ml-4" />
            <Skeleton className="h-4 w-44 ml-4" />
          </div>
        ) : treeData.length === 0 ? (
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No conversations yet.
          </div>
        ) : (
          <div className="rounded-lg border border-border p-2">
            <Tree<ThreadTreeNode>
              data={treeData}
              idAccessor="thread_id"
              childrenAccessor={(d) => (d.children.length > 0 ? d.children : null)}
              openByDefault
              disableDrag
              disableDrop
              disableEdit
              disableMultiSelection
              indent={16}
              rowHeight={32}
              width="100%"
              height={countNodes(treeData) * 32 + 8}
              padding={0}
              className="!overflow-visible"
            >
              {ThreadNode}
            </Tree>
          </div>
        )}
      </section>
    </div>
  );
}
