# Study Plans Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/study-plans` from a simple thread list into an interactive topic hub with search, enriched cards, and a detail view showing plan progress, mastery placeholder, and thread tree.

**Architecture:** Client component page with two views toggled by `selectedTopic` state. Grid view shows searchable topic cards using `useStudyTopics()`. Detail view fetches plan progress via `getProgress()` and thread tree via `useThreadTree()`, rendering phases/concepts and a `react-arborist` tree.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, TanStack Query, react-arborist, shadcn/ui components

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `client/lib/topic-utils.ts` | Create | Shared utilities: GRADIENTS, topicGradient, phaseLabel, timeAgo |
| `client/components/study-topic-card.tsx` | Modify | Import shared utils from `topic-utils.ts` instead of defining inline |
| `client/app/study-plans/page.tsx` | Rewrite | Main page — client component with search, grid/detail toggle |
| `client/app/study-plans/study-plan-card.tsx` | Create | Grid card — visual design from `StudyTopicCard`, onClick instead of Link |
| `client/app/study-plans/topic-detail.tsx` | Create | Detail view — header, plan progress, mastery placeholder, thread tree |
| `client/app/study-plans/thread-card.tsx` | Delete | No longer used (replaced by `study-plan-card.tsx`) |

---

### Task 1: Extract Shared Topic Utilities

**Files:**
- Create: `client/lib/topic-utils.ts`
- Modify: `client/components/study-topic-card.tsx`

Extract GRADIENTS array, `topicGradient`, `phaseLabel`, and `timeAgo` into a shared module so both `StudyTopicCard` and `StudyPlanCard` can use them without duplication.

- [ ] **Step 1: Create topic-utils.ts**

```ts
// client/lib/topic-utils.ts

export const GRADIENTS = [
  // Purples & violets
  "from-violet-600/30 via-indigo-500/20 to-purple-700/10",
  "from-purple-500/30 via-violet-400/20 to-fuchsia-600/10",
  "from-indigo-600/30 via-purple-500/20 to-violet-700/10",
  "from-fuchsia-500/30 via-purple-400/20 to-indigo-600/10",
  "from-violet-500/30 via-fuchsia-400/20 to-purple-600/10",
  "from-purple-600/30 via-indigo-400/20 to-violet-500/10",
  "from-indigo-500/30 via-violet-600/20 to-purple-400/10",
  "from-fuchsia-600/30 via-violet-500/20 to-purple-700/10",
  "from-violet-700/30 via-purple-500/20 to-indigo-400/10",
  "from-purple-400/30 via-fuchsia-500/20 to-violet-600/10",
  // Blues & cyans
  "from-blue-600/30 via-cyan-500/20 to-indigo-700/10",
  "from-sky-500/30 via-blue-400/20 to-cyan-600/10",
  "from-cyan-600/30 via-sky-500/20 to-blue-700/10",
  "from-blue-500/30 via-indigo-400/20 to-sky-600/10",
  "from-sky-600/30 via-cyan-400/20 to-blue-500/10",
  "from-indigo-500/30 via-blue-600/20 to-cyan-400/10",
  "from-cyan-500/30 via-blue-400/20 to-sky-700/10",
  "from-blue-700/30 via-sky-500/20 to-cyan-600/10",
  "from-sky-400/30 via-indigo-500/20 to-blue-600/10",
  "from-cyan-400/30 via-blue-500/20 to-indigo-600/10",
  // Greens & teals
  "from-emerald-600/30 via-teal-500/20 to-green-700/10",
  "from-green-500/30 via-emerald-400/20 to-teal-600/10",
  "from-teal-600/30 via-green-500/20 to-emerald-700/10",
  "from-emerald-500/30 via-green-600/20 to-teal-400/10",
  "from-green-600/30 via-teal-400/20 to-emerald-500/10",
  "from-teal-500/30 via-emerald-600/20 to-green-400/10",
  "from-green-400/30 via-teal-500/20 to-emerald-600/10",
  "from-emerald-400/30 via-green-500/20 to-teal-700/10",
  "from-teal-700/30 via-emerald-500/20 to-green-600/10",
  "from-green-700/30 via-emerald-400/20 to-teal-500/10",
  // Ambers & oranges
  "from-amber-600/30 via-orange-500/20 to-yellow-700/10",
  "from-orange-500/30 via-amber-400/20 to-yellow-600/10",
  "from-yellow-600/30 via-amber-500/20 to-orange-700/10",
  "from-amber-500/30 via-yellow-400/20 to-orange-600/10",
  "from-orange-600/30 via-yellow-500/20 to-amber-400/10",
  "from-yellow-500/30 via-orange-400/20 to-amber-700/10",
  "from-amber-400/30 via-orange-600/20 to-yellow-500/10",
  "from-orange-700/30 via-amber-500/20 to-yellow-400/10",
  "from-yellow-400/30 via-amber-600/20 to-orange-500/10",
  "from-orange-400/30 via-yellow-600/20 to-amber-500/10",
  // Roses & pinks
  "from-rose-600/30 via-pink-500/20 to-red-700/10",
  "from-pink-500/30 via-rose-400/20 to-fuchsia-600/10",
  "from-red-600/30 via-rose-500/20 to-pink-700/10",
  "from-rose-500/30 via-red-400/20 to-pink-600/10",
  "from-pink-600/30 via-fuchsia-400/20 to-rose-500/10",
  "from-red-500/30 via-pink-400/20 to-rose-700/10",
  "from-fuchsia-500/30 via-rose-400/20 to-pink-600/10",
  "from-rose-400/30 via-pink-600/20 to-red-500/10",
  "from-pink-700/30 via-rose-500/20 to-fuchsia-400/10",
  "from-red-400/30 via-rose-600/20 to-pink-500/10",
  // Cross-hue blends
  "from-violet-500/30 via-blue-400/20 to-cyan-600/10",
  "from-blue-500/30 via-teal-400/20 to-emerald-600/10",
  "from-emerald-500/30 via-yellow-400/20 to-amber-600/10",
  "from-amber-500/30 via-rose-400/20 to-pink-600/10",
  "from-pink-500/30 via-violet-400/20 to-indigo-600/10",
  "from-cyan-500/30 via-emerald-400/20 to-green-600/10",
  "from-indigo-500/30 via-cyan-400/20 to-teal-600/10",
  "from-teal-500/30 via-blue-400/20 to-indigo-600/10",
  "from-rose-500/30 via-amber-400/20 to-yellow-600/10",
  "from-fuchsia-500/30 via-pink-400/20 to-rose-600/10",
  // Warm-cool contrasts
  "from-rose-600/30 via-violet-400/20 to-blue-500/10",
  "from-amber-600/30 via-emerald-400/20 to-teal-500/10",
  "from-orange-500/30 via-pink-400/20 to-purple-600/10",
  "from-yellow-500/30 via-green-400/20 to-cyan-600/10",
  "from-red-500/30 via-indigo-400/20 to-blue-600/10",
  "from-pink-600/30 via-sky-400/20 to-cyan-500/10",
  "from-amber-500/30 via-violet-400/20 to-purple-600/10",
  "from-rose-500/30 via-teal-400/20 to-emerald-600/10",
  "from-orange-600/30 via-blue-400/20 to-indigo-500/10",
  "from-fuchsia-600/30 via-cyan-400/20 to-teal-500/10",
  // Moody & deep
  "from-slate-600/30 via-indigo-500/20 to-violet-700/10",
  "from-zinc-500/30 via-purple-400/20 to-fuchsia-600/10",
  "from-stone-600/30 via-amber-500/20 to-orange-700/10",
  "from-gray-500/30 via-blue-400/20 to-cyan-600/10",
  "from-neutral-600/30 via-emerald-500/20 to-teal-700/10",
  "from-slate-500/30 via-rose-400/20 to-pink-600/10",
  "from-zinc-600/30 via-sky-500/20 to-blue-700/10",
  "from-stone-500/30 via-green-400/20 to-emerald-600/10",
  "from-gray-600/30 via-violet-500/20 to-purple-700/10",
  "from-neutral-500/30 via-orange-400/20 to-amber-600/10",
  // Vibrant pops
  "from-lime-500/30 via-green-400/20 to-emerald-600/10",
  "from-lime-600/30 via-yellow-400/20 to-amber-500/10",
  "from-sky-600/30 via-violet-400/20 to-fuchsia-500/10",
  "from-teal-600/30 via-cyan-400/20 to-sky-500/10",
  "from-fuchsia-600/30 via-pink-500/20 to-rose-400/10",
  "from-emerald-600/30 via-cyan-500/20 to-sky-400/10",
  "from-violet-600/30 via-rose-400/20 to-pink-500/10",
  "from-blue-600/30 via-emerald-400/20 to-green-500/10",
  "from-pink-600/30 via-amber-400/20 to-orange-500/10",
  "from-indigo-600/30 via-teal-400/20 to-emerald-500/10",
];

/** Deterministic gradient based on topic name so the same topic always gets the same color */
export function topicGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export function phaseLabel(phase: string) {
  if (phase === "interview") return "Interview";
  if (phase === "planning") return "Planning";
  if (phase === "teaching") return "Learning";
  return phase;
}

export function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 2: Update StudyTopicCard to import from topic-utils**

In `client/components/study-topic-card.tsx`:
- Remove the inline `GRADIENTS` array, `topicGradient`, `phaseLabel`, and `timeAgo` definitions
- Add import: `import { topicGradient, phaseLabel, timeAgo } from "@/lib/topic-utils";`
- Everything else stays the same

- [ ] **Step 3: Verify it builds**

Run: `cd client && pnpm build`
Expected: Build succeeds, existing `StudyTopicCard` usage unaffected

- [ ] **Step 4: Commit**

```bash
git add client/lib/topic-utils.ts client/components/study-topic-card.tsx
git commit -m "refactor: extract shared topic utils (gradients, phaseLabel, timeAgo)"
```

---

### Task 2: Create `StudyPlanCard` Component

**Files:**
- Create: `client/app/study-plans/study-plan-card.tsx`

Visual clone of `StudyTopicCard` with `onClick` instead of `<Link>`, without the "Continue" button. Keeps the conversation title line.

- [ ] **Step 1: Create the card component**

```tsx
// client/app/study-plans/study-plan-card.tsx
"use client";

import { type StudyTopic } from "@/lib/api";
import { topicGradient, phaseLabel, timeAgo } from "@/lib/topic-utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardFooter,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export function StudyPlanCard({
  topic,
  onClick,
}: {
  topic: StudyTopic;
  onClick: () => void;
}) {
  const pct = Math.round(topic.progress * 100);
  const gradient = topicGradient(topic.topic);
  const conversationTitle = topic.latest_thread.title;
  const showConversation =
    conversationTitle && conversationTitle !== topic.topic;

  return (
    <TooltipProvider>
      <Card
        className="relative overflow-hidden pt-0 hover:ring-foreground/20 transition-all cursor-pointer h-full flex flex-col"
        onClick={onClick}
      >
        {/* Gradient header with progress ring */}
        <div
          className={`relative flex items-end justify-end bg-gradient-to-br ${gradient} p-4 h-28`}
        >
          <div className="relative flex items-center justify-center">
            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/10" />
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${pct * 1.257} 125.7`} strokeLinecap="round" className="text-primary transition-all duration-500" />
            </svg>
            <span className="absolute text-xs font-semibold text-foreground">{pct}%</span>
          </div>
        </div>

        <CardHeader className="min-w-0">
          <CardAction>
            <Badge variant="secondary">{phaseLabel(topic.phase)}</Badge>
          </CardAction>
          <Tooltip>
            <TooltipTrigger render={<CardTitle className="text-lg font-bold leading-tight truncate" />}>
              {topic.topic}
            </TooltipTrigger>
            <TooltipContent side="right">{topic.topic}</TooltipContent>
          </Tooltip>
          {topic.current_concept && (
            <Tooltip>
              <TooltipTrigger render={<CardDescription className="truncate" />}>
                {topic.current_concept}
              </TooltipTrigger>
              <TooltipContent side="right">{topic.current_concept}</TooltipContent>
            </Tooltip>
          )}
          {showConversation && (
            <Tooltip>
              <TooltipTrigger render={<p className="truncate text-xs text-muted-foreground/70 mt-0.5" />}>
                {conversationTitle}
              </TooltipTrigger>
              <TooltipContent side="right">{conversationTitle}</TooltipContent>
            </Tooltip>
          )}
        </CardHeader>

        <CardFooter className="mt-auto">
          <span className="text-xs text-muted-foreground">
            {timeAgo(topic.latest_thread.updated_at)}
          </span>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd client && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add client/app/study-plans/study-plan-card.tsx
git commit -m "feat(study-plans): add StudyPlanCard component with onClick behavior"
```

---

### Task 3: Create `TopicDetail` Component

**Files:**
- Create: `client/app/study-plans/topic-detail.tsx`

Detail view showing header, plan progress (phases/concepts with collapsible groups), mastery placeholder, and thread tree. Includes error retry and loading skeletons.

- [ ] **Step 1: Create the detail component**

```tsx
// client/app/study-plans/topic-detail.tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

// --- Progress Ring (conic-gradient style from topic-progress.tsx) ---

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

// --- Collapsible Phase Group ---

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

// --- Thread Tree Node (simplified, no delete) ---

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

// --- Helpers ---

function countNodes(nodes: ThreadTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

// --- Main Component ---

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

  // Extract the subtree for this topic's root thread
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
            <Button asChild>
              <a href={`/threads/${topic.latest_thread.id}`}>
                Continue <ArrowRight className="ml-1 size-4" />
              </a>
            </Button>
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
```

- [ ] **Step 2: Verify it builds**

Run: `cd client && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add client/app/study-plans/topic-detail.tsx
git commit -m "feat(study-plans): add TopicDetail with collapsible plan, mastery placeholder, thread tree"
```

---

### Task 4: Rewrite the Study Plans Page

**Files:**
- Rewrite: `client/app/study-plans/page.tsx`
- Delete: `client/app/study-plans/thread-card.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
// client/app/study-plans/page.tsx
"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { useStudyTopics } from "@/hooks/use-study-topics";
import { type StudyTopic } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StudyPlanCard } from "./study-plan-card";
import { TopicDetail } from "./topic-detail";

export default function StudyPlansPage() {
  const { topics, isLoading } = useStudyTopics();
  const [selectedTopic, setSelectedTopic] = useState<StudyTopic | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return topics;
    const q = query.toLowerCase();
    return topics.filter((t) => t.topic.toLowerCase().includes(q));
  }, [topics, query]);

  if (selectedTopic) {
    return (
      <div className="px-6 py-6 max-w-3xl mx-auto">
        <TopicDetail topic={selectedTopic} onBack={() => setSelectedTopic(null)} />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Study Plans</h1>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search topics..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-28 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty states */}
      {!isLoading && topics.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No study plans yet. Start a conversation to create one.
        </p>
      )}

      {!isLoading && topics.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No topics match your search.
        </p>
      )}

      {/* Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((topic) => (
            <StudyPlanCard
              key={topic.root_thread_id}
              topic={topic}
              onClick={() => setSelectedTopic(topic)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old thread-card.tsx**

```bash
rm client/app/study-plans/thread-card.tsx
```

- [ ] **Step 3: Verify it builds**

Run: `cd client && pnpm build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Manual smoke test**

Run: `cd client && pnpm dev`

1. Navigate to `http://localhost:3000/study-plans`
2. Verify: search box appears, topic cards render with gradients and progress rings
3. Type in search box — cards filter instantly, "No topics match your search" appears for no matches
4. Click a card — detail view appears with back button, collapsible plan progress, tests placeholder, thread tree
5. Click phase header — phase collapses/expands
6. Click "← All Study Plans" — returns to grid
7. Click a thread in the tree — navigates to `/threads/{id}`
8. Click "Continue" button — navigates to latest thread

- [ ] **Step 5: Commit**

```bash
git add client/app/study-plans/page.tsx
git rm client/app/study-plans/thread-card.tsx
git commit -m "feat(study-plans): rewrite page with search, enriched cards, and detail view"
```
