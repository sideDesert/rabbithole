# Graph Views Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two React Flow graph visualizations — a thread map tab and a knowledge graph page — with shared components and cross-linking.

**Architecture:** Backend adds two new endpoints (`/threads/{id}/map` and `/knowledge-graph`) returning flat node/edge data. Frontend uses `@xyflow/react` with dagre layout and custom node/edge components styled with shadcn tokens. A shared `PreviewPanel` handles click-to-preview on both views.

**Tech Stack:** Python/FastAPI, @xyflow/react, @dagrejs/dagre, TanStack Query, Tailwind 4, shadcn tokens

**Spec:** `docs/superpowers/specs/2026-03-14-graph-views-design.md`

---

## Chunk 1: Backend — Model Changes + Thread Map Endpoint

### Task 1: Add fields to BranchPoint model

**Files:**
- Modify: `backend/app/models/branch_point.py`

- [ ] **Step 1: Add source_concept and branch_topic fields**

```python
# In BranchPoint class, add after child_thread_id:
    source_concept: str | None = None
    branch_topic: str | None = None
```

- [ ] **Step 2: Verify no tests break**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest -x -q`

- [ ] **Step 3: Commit**

```bash
git add app/models/branch_point.py
git commit -m "feat: add source_concept and branch_topic to BranchPoint"
```

---

### Task 2: Populate new BranchPoint fields on branch creation

**Files:**
- Modify: `backend/app/api/chat.py:447-454` (the `create_branch` endpoint, BranchPoint construction)

- [ ] **Step 1: Update BranchPoint creation to include new fields**

In the `create_branch` function (line ~447), first compute the current concept from the plan (since `current_concept` is not persisted on the thread doc), then update the `BranchPoint(...)` construction:

```python
    # Compute current_concept from plan (not persisted on thread doc)
    _, branch_source_concept = get_plan_context(parent.get("topic_slug"))

    bp = BranchPoint(
        thread_id=thread_id,
        message_id=req.message_id,
        position=position,
        type=req.branch_type,
        child_thread_id=child.id,
        source_concept=branch_source_concept,
        branch_topic=req.branch_text,
    )
```

- [ ] **Step 2: Verify no tests break**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest -x -q`

- [ ] **Step 3: Commit**

```bash
git add app/api/chat.py
git commit -m "feat: populate source_concept and branch_topic on branch creation"
```

---

### Task 3: Extract shared tree-walk helper

**Files:**
- Create: `backend/app/api/tree_helpers.py`
- Modify: `backend/app/api/chat.py` (refactor `get_all_trees` and `get_branch_tree` to use helper)

- [ ] **Step 1: Create tree_helpers.py with shared logic**

```python
"""Shared helpers for walking thread trees."""

from app.db import mongo


def load_thread_tree(thread_id: str) -> tuple[str, dict[str, dict], dict[str, list[str]]]:
    """Load all threads in a tree and return (root_id, thread_map, children_by_parent).

    thread_map: {thread_id: mongo_doc}
    children_by_parent: {parent_id: [child_id, ...]}
    """
    thread = mongo.threads().find_one({"_id": thread_id})
    if not thread:
        return "", {}, {}

    root_id = str(thread.get("root_thread_id", thread_id))
    all_threads = list(mongo.threads().find({"root_thread_id": root_id}))
    if not any(t["_id"] == root_id for t in all_threads):
        root_doc = mongo.threads().find_one({"_id": root_id})
        if root_doc:
            all_threads.append(root_doc)

    by_parent: dict[str, list[str]] = {}
    thread_map: dict[str, dict] = {}
    for t in all_threads:
        tid = str(t["_id"])
        thread_map[tid] = t
        pid = t.get("parent_thread_id")
        if pid:
            by_parent.setdefault(str(pid), []).append(tid)

    return root_id, thread_map, by_parent
```

- [ ] **Step 2: Refactor get_branch_tree in chat.py to use the helper**

Replace the `get_branch_tree` function body (lines 499-532) with:

```python
@router.get("/threads/{thread_id}/tree")
def get_branch_tree(thread_id: str):
    from app.api.tree_helpers import load_thread_tree

    root_id, thread_map, by_parent = load_thread_tree(thread_id)
    if not root_id:
        return {"error": "Thread not found"}

    def build_node(tid: str) -> dict[str, object]:
        t = thread_map.get(tid, {})
        return {
            "thread_id": tid,
            "title": t.get("title", ""),
            "status": t.get("status", ""),
            "phase": t.get("phase", ""),
            "depth": t.get("depth", 0),
            "children": [build_node(cid) for cid in by_parent.get(tid, [])],
        }

    return {"tree": build_node(root_id)}
```

- [ ] **Step 3: Verify no tests break**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest -x -q`

- [ ] **Step 4: Commit**

```bash
git add app/api/tree_helpers.py app/api/chat.py
git commit -m "refactor: extract shared tree-walk helper from chat.py"
```

---

### Task 4: Add thread map endpoint

**Files:**
- Create: `backend/app/api/graph.py`
- Modify: `backend/main.py` (register the new router)

- [ ] **Step 1: Create graph.py with the thread map endpoint**

```python
"""Graph visualization endpoints."""

from fastapi import APIRouter

from app.api.tree_helpers import load_thread_tree
from app.config import PLANS_DIR
from app.db import mongo
from app.plan_parser import parse_plan

router = APIRouter(prefix="/api", tags=["graph"])


def _thread_plan_info(topic_slug: str | None) -> tuple[float | None, str | None]:
    """Compute plan progress and current concept for a thread.
    Returns (progress, current_concept). Both None if no plan exists."""
    if not topic_slug:
        return None, None
    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return None, None
    tree = parse_plan(plan_path.read_text())
    first = tree.first_uncompleted_concept()
    return round(tree.overall_progress, 2), (first.name if first else None)


@router.get("/threads/{thread_id}/map")
def get_thread_map(thread_id: str):
    root_id, thread_map, by_parent = load_thread_tree(thread_id)
    if not root_id:
        return {"error": "Thread not found"}

    # Load branch points for this tree to get source_concept/branch_topic
    all_thread_ids = list(thread_map.keys())
    branch_points = list(
        mongo.branch_points().find({"thread_id": {"$in": all_thread_ids}})
    )
    # Index by child_thread_id for easy lookup
    bp_by_child: dict[str, dict] = {}
    for bp in branch_points:
        bp_by_child[bp["child_thread_id"]] = bp

    nodes = []
    edges = []

    def walk(tid: str):
        t = thread_map.get(tid, {})
        topic_slug = t.get("topic_slug") or None
        progress, current_concept = _thread_plan_info(topic_slug)
        nodes.append({
            "thread_id": tid,
            "title": t.get("title", ""),
            "phase": t.get("phase", ""),
            "depth": t.get("depth", 0),
            "current_concept": current_concept,
            "summary": t.get("summary"),
            "status": t.get("status", "active"),
            "progress": progress,
        })
        for cid in by_parent.get(tid, []):
            bp = bp_by_child.get(cid, {})
            edges.append({
                "source": tid,
                "target": cid,
                "source_concept": bp.get("source_concept"),
                "branch_topic": bp.get("branch_topic"),
            })
            walk(cid)

    walk(root_id)
    return {"nodes": nodes, "edges": edges}
```

- [ ] **Step 2: Register the graph router in main.py**

Find where `chat.router` is included in `main.py` and add:

```python
from app.api.graph import router as graph_router
app.include_router(graph_router)
```

- [ ] **Step 3: Test the endpoint manually**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run uvicorn main:app --reload --port 8000`

Then in another terminal: `curl http://localhost:8000/api/threads/<some_thread_id>/map | python -m json.tool`

Expected: JSON with `nodes` and `edges` arrays.

- [ ] **Step 4: Commit**

```bash
git add app/api/graph.py main.py
git commit -m "feat: add GET /threads/{id}/map endpoint for thread map"
```

---

## Chunk 2: Backend — Knowledge Graph Endpoint + Plan JSON

### Task 5: Save structured plan JSON alongside markdown

**Files:**
- Modify: `backend/app/tools_impl.py:159-200` (the `create_plan` function)

- [ ] **Step 1: Update create_plan to save plan.json**

After the markdown is generated and parsed (line ~191), add JSON export. Since the LLM currently generates free-form markdown (not structured output), we'll extract what we can from the parsed tree — concept names and their order. Prerequisites aren't in the markdown, so we'll add a second lightweight LLM call to extract them.

Actually, the simpler approach: save the parsed `PlanTree` as JSON. This preserves concept names, phases, and order. For prerequisites, we can derive them from concept ordering within phases (each concept implicitly depends on the one before it in the same phase).

Update the `create_plan` function — after line 191 (`tree = parse_plan(markdown)`), add:

```python
    # Save structured plan data as JSON for knowledge graph
    plan_data = {
        "topic": tree.topic,
        "depth": tree.depth,
        "prior_knowledge": tree.prior_knowledge,
        "phases": [
            {
                "title": phase.title,
                "order": phase.order,
                "concepts": [
                    {
                        "name": concept.name,
                        "description": concept.description,
                        "order": concept.order,
                    }
                    for concept in phase.concepts
                ],
            }
            for phase in tree.phases
        ],
    }
    (plan_dir / "plan.json").write_text(json.dumps(plan_data, indent=2))
```

- [ ] **Step 2: Verify no tests break**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest -x -q`

- [ ] **Step 3: Commit**

```bash
git add app/tools_impl.py
git commit -m "feat: save plan.json alongside plan.md for knowledge graph"
```

---

### Task 6: Add knowledge graph endpoint

**Files:**
- Modify: `backend/app/api/graph.py`

- [ ] **Step 1: Add the knowledge graph endpoint**

Append to `graph.py`:

```python
import json as _json
from pathlib import Path


def _load_all_plans() -> list[tuple[str, dict]]:
    """Load all plan.json files. Returns [(topic_slug, plan_data), ...]."""
    plans = []
    if not PLANS_DIR.exists():
        return plans
    for slug_dir in PLANS_DIR.iterdir():
        if not slug_dir.is_dir():
            continue
        json_path = slug_dir / "plan.json"
        if json_path.exists():
            try:
                data = _json.loads(json_path.read_text())
                plans.append((slug_dir.name, data))
            except (ValueError, OSError):
                continue
    return plans


def _find_threads_for_slug(topic_slug: str) -> list[str]:
    """Find all thread IDs that use this topic_slug."""
    docs = mongo.threads().find(
        {"topic_slug": topic_slug},
        {"_id": 1},
    )
    return [str(doc["_id"]) for doc in docs]


@router.get("/knowledge-graph")
def get_knowledge_graph():
    plans = _load_all_plans()
    if not plans:
        return {"concepts": [], "prerequisites": []}

    # Collect all concepts across plans
    concepts_map: dict[str, dict] = {}  # name -> concept info
    prerequisites: list[dict[str, str]] = []

    for topic_slug, plan_data in plans:
        thread_ids = _find_threads_for_slug(topic_slug)

        for phase in plan_data.get("phases", []):
            phase_concepts = phase.get("concepts", [])
            prev_name = None
            for concept in phase_concepts:
                name = concept["name"]
                if name not in concepts_map:
                    concepts_map[name] = {
                        "name": name,
                        "mastery_score": 0.0,
                        "strength_trend": "stable",
                        "threads": [],
                        "last_reviewed": None,
                    }
                # Add thread IDs (deduplicated)
                for tid in thread_ids:
                    if tid not in concepts_map[name]["threads"]:
                        concepts_map[name]["threads"].append(tid)

                # Sequential prerequisite: each concept depends on the previous in its phase
                if prev_name and prev_name != name:
                    edge = {"source": prev_name, "target": name}
                    if edge not in prerequisites:
                        prerequisites.append(edge)
                prev_name = name

    # Overlay mastery data from ConceptMastery collection
    mastery_docs = list(mongo.db()["concept_mastery"].find({"user_id": "user_001"}))
    for doc in mastery_docs:
        name = doc.get("concept_name", "")
        if name in concepts_map:
            concepts_map[name]["mastery_score"] = doc.get("mastery_score", 0.0)
            concepts_map[name]["strength_trend"] = doc.get("strength_trend", "stable")
            concepts_map[name]["last_reviewed"] = str(doc["last_reviewed"]) if doc.get("last_reviewed") else None

    return {
        "concepts": list(concepts_map.values()),
        "prerequisites": prerequisites,
    }
```

- [ ] **Step 2: Test the endpoint**

Run the server and curl: `curl http://localhost:8000/api/knowledge-graph | python -m json.tool`

Expected: JSON with `concepts` and `prerequisites` arrays (may be empty if no plans exist yet).

- [ ] **Step 3: Commit**

```bash
git add app/api/graph.py
git commit -m "feat: add GET /knowledge-graph endpoint"
```

---

## Chunk 3: Frontend — Dependencies + Shared Graph Components

### Task 7: Install dependencies

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install @xyflow/react and @dagrejs/dagre**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm add @xyflow/react @dagrejs/dagre`

- [ ] **Step 2: Install dagre types**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm add -D @types/dagre`

Note: `@dagrejs/dagre` may not have separate types. If `@types/dagre` doesn't exist or errors, skip it — we can use `// @ts-expect-error` or declare a module.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @xyflow/react and @dagrejs/dagre dependencies"
```

---

### Task 8: Create dagre layout helper

**Files:**
- Create: `client/lib/graph-layout.ts`

- [ ] **Step 1: Create the layout helper**

```typescript
import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

interface LayoutOptions {
  direction?: "TB" | "LR";
  nodeWidth?: number;
  nodeHeight?: number;
}

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
): { nodes: Node[]; edges: Edge[] } {
  const { direction = "TB", nodeWidth = 250, nodeHeight = 80 } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/graph-layout.ts
git commit -m "feat: add dagre layout helper for graph views"
```

---

### Task 9: Create API functions

**Files:**
- Modify: `client/lib/api.ts`

- [ ] **Step 1: Add types and fetch functions at the end of api.ts**

```typescript
// ── Graph Views ──────────────────────────────────────────────────────────

export interface ThreadMapNode {
  thread_id: string;
  title: string;
  phase: string;
  depth: number;
  current_concept: string | null;
  summary: string | null;
  status: string;
  progress: number | null;
}

export interface ThreadMapEdge {
  source: string;
  target: string;
  source_concept: string | null;
  branch_topic: string | null;
}

export interface ThreadMapData {
  nodes: ThreadMapNode[];
  edges: ThreadMapEdge[];
}

export async function fetchThreadMap(threadId: string): Promise<ThreadMapData> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/map`);
  return res.json();
}

export interface KnowledgeConcept {
  name: string;
  mastery_score: number;
  strength_trend: "improving" | "stable" | "declining";
  threads: string[];
  last_reviewed: string | null;
}

export interface KnowledgeGraphData {
  concepts: KnowledgeConcept[];
  prerequisites: { source: string; target: string }[];
}

export async function fetchKnowledgeGraph(): Promise<KnowledgeGraphData> {
  const res = await fetch(`${API_BASE}/knowledge-graph`);
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/api.ts
git commit -m "feat: add API types and fetch functions for graph views"
```

---

### Task 10: Create TrailEdge component

**Files:**
- Create: `client/components/graph/trail-edge.tsx`

- [ ] **Step 1: Create the custom edge component**

```tsx
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

interface TrailEdgeData {
  branch_topic?: string | null;
}

export function TrailEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const edgeData = data as TrailEdgeData | undefined;
  const label = edgeData?.branch_topic;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "hsl(var(--border))",
          strokeWidth: 1.5,
          strokeDasharray: "6 4",
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/trail-edge.tsx
git commit -m "feat: add TrailEdge custom React Flow edge component"
```

---

### Task 11: Create ThreadNode component

**Files:**
- Create: `client/components/graph/thread-node.tsx`

- [ ] **Step 1: Create the custom node component**

```tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

interface ThreadNodeData {
  title: string;
  phase: string;
  depth: number;
  current_concept: string | null;
  status: string;
  progress: number | null;
}

const phaseBadgeColors: Record<string, string> = {
  interview: "bg-chart-1/20 text-chart-1",
  planning: "bg-chart-3/20 text-chart-3",
  teaching: "bg-primary/20 text-primary",
};

export function ThreadNode({ data, selected }: NodeProps) {
  const d = data as unknown as ThreadNodeData;
  const isRoot = d.depth === 0;

  return (
    <div
      className={cn(
        "bg-card border rounded-lg px-4 py-3 min-w-[200px] max-w-[280px] cursor-pointer transition-shadow",
        isRoot ? "border-primary border-2 shadow-md" : "border-border",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-border !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1">
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            phaseBadgeColors[d.phase] ?? "bg-muted text-muted-foreground",
          )}
        >
          {d.phase}
        </span>
      </div>

      <p className="text-sm font-medium text-foreground truncate">{d.title}</p>

      {d.current_concept && (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {d.current_concept}
        </p>
      )}

      {d.progress !== null && (
        <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round(d.progress * 100)}%` }}
          />
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-border !w-2 !h-2" />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/thread-node.tsx
git commit -m "feat: add ThreadNode custom React Flow node component"
```

---

### Task 12: Create ConceptNode component

**Files:**
- Create: `client/components/graph/concept-node.tsx`

- [ ] **Step 1: Create the custom node component**

```tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConceptNodeData {
  name: string;
  mastery_score: number;
  strength_trend: "improving" | "stable" | "declining";
}

function MasteryRing({ score }: { score: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * score;

  return (
    <svg width="28" height="28" className="shrink-0">
      <circle cx="14" cy="14" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
      <circle
        cx="14"
        cy="14"
        r={radius}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
      />
    </svg>
  );
}

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "improving") return <TrendingUp className="size-3 text-chart-1" />;
  if (trend === "declining") return <TrendingDown className="size-3 text-destructive" />;
  return <Minus className="size-3 text-muted-foreground" />;
};

export function ConceptNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConceptNodeData;
  const score = d.mastery_score;

  // Mastery tiers for styling
  const isMastered = score >= 0.7;
  const isMedium = score >= 0.4 && score < 0.7;
  const isWeak = score > 0 && score < 0.4;
  const isUndiscovered = score === 0;

  return (
    <div
      className={cn(
        "bg-card rounded-lg px-4 py-3 min-w-[180px] max-w-[240px] cursor-pointer transition-all",
        isMastered && "border-2 border-primary shadow-sm",
        isMedium && "border border-muted-foreground",
        isWeak && "border border-dashed border-muted-foreground opacity-70",
        isUndiscovered && "border border-dashed border-border opacity-40 blur-[0.5px]",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />

      <div className="flex items-center gap-2">
        <MasteryRing score={score} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {Math.round(score * 100)}%
            </span>
            <TrendIcon trend={d.strength_trend} />
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/concept-node.tsx
git commit -m "feat: add ConceptNode custom React Flow node component"
```

---

### Task 13: Create PreviewPanel component

**Files:**
- Create: `client/components/graph/preview-panel.tsx`

- [ ] **Step 1: Create the preview panel**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreviewPanelProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function PreviewPanel({ open, onClose, children }: PreviewPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-4 right-4 w-80 max-h-[calc(100%-2rem)] overflow-auto bg-card border border-border rounded-xl shadow-lg z-10 animate-in slide-in-from-right-4 fade-in duration-200"
    >
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-medium">Details</span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/preview-panel.tsx
git commit -m "feat: add PreviewPanel component for graph views"
```

---

## Chunk 4: Frontend — Thread Map Tab

### Task 14: Create thread map data hook

**Files:**
- Create: `client/hooks/use-thread-map.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from "@tanstack/react-query";
import { fetchThreadMap } from "@/lib/api";

export function useThreadMap(threadId: string | undefined) {
  return useQuery({
    queryKey: ["thread-map", threadId],
    queryFn: () => fetchThreadMap(threadId!),
    enabled: !!threadId,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/use-thread-map.ts
git commit -m "feat: add useThreadMap data hook"
```

---

### Task 15: Create ThreadMap component

**Files:**
- Create: `client/components/graph/thread-map.tsx`

- [ ] **Step 1: Create the thread map React Flow canvas**

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
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

  // Use controlled nodes/edges via useMemo — graph is read-only so no need for useNodesState
  const { nodes, edges } = useMemo(() => {
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

    return layoutGraph(rfNodes, rfEdges, { direction: "TB" });
  }, [data]);

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
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        nodesDraggable={false}
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
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/thread-map.tsx
git commit -m "feat: add ThreadMap React Flow component"
```

---

### Task 16: Wire graph-mode tab in main-content.tsx

**Files:**
- Modify: `client/components/main-content.tsx`

- [ ] **Step 1: Import ThreadMap and render it for graph-mode tab**

Add import at top of `main-content.tsx`:

```typescript
import { ThreadMap } from "@/components/graph/thread-map";
```

Then update the JSX. Replace lines 68-74:

```tsx
        {/* Keep page content mounted but hidden when plan tab is active
            so chat state isn't lost on tab switch */}
        <div className={activeTab === "plan-mode" ? "hidden" : ""}>
          {children}
        </div>
        {activeTab === "plan-mode" && <PlanView />}
```

With:

```tsx
        {/* Keep page content mounted but hidden when non-chat tab is active
            so chat state isn't lost on tab switch */}
        <div className={activeTab !== "chat-mode" ? "hidden" : ""}>
          {children}
        </div>
        {activeTab === "plan-mode" && <PlanView />}
        {activeTab === "graph-mode" && threadId && <ThreadMap threadId={threadId} />}
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build`

Expected: Build succeeds without errors.

- [ ] **Step 3: Commit**

```bash
git add components/main-content.tsx
git commit -m "feat: wire graph-mode tab to ThreadMap component"
```

---

## Chunk 5: Frontend — Knowledge Graph Page

### Task 17: Create knowledge graph data hook

**Files:**
- Create: `client/hooks/use-knowledge-graph.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeGraph } from "@/lib/api";

export function useKnowledgeGraph() {
  return useQuery({
    queryKey: ["knowledge-graph"],
    queryFn: fetchKnowledgeGraph,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/use-knowledge-graph.ts
git commit -m "feat: add useKnowledgeGraph data hook"
```

---

### Task 18: Create knowledge graph page

**Files:**
- Create: `client/app/knowledge-graph/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
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

  // Use controlled nodes/edges — graph is read-only
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

  // Handle ?focus param after layout
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
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/knowledge-graph/page.tsx
git commit -m "feat: add knowledge graph page with React Flow visualization"
```

---

### Task 19: Fix sidebar knowledge graph link

**Files:**
- Modify: `client/components/app-sidebar.tsx`

The existing link is `href: "/knowledge-graph"` which should already work with the new page. Verify the link path matches. Check line 29:

```typescript
  { name: "Knowledge Graph", icon: Network, href: "/knowledge-graph" },
```

- [ ] **Step 1: Verify the link works**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm dev`

Navigate to the app, click "Knowledge Graph" in the sidebar. Should show the graph page (or empty state if no plans exist).

- [ ] **Step 2: Manual smoke test**

1. Open a thread that has branches → click the Graph tab (NetworkIcon) → should see the thread map
2. Click a node → preview panel appears with details
3. Navigate to Knowledge Graph via sidebar → should see concept nodes (or empty state)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete graph views — thread map tab + knowledge graph page"
```
