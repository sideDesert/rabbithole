# Graph Views Design — Thread Map & Knowledge Graph

## Summary

Two graph visualizations built with React Flow (@xyflow/react), using a shared component library and cross-linking between views. Cartographic-inspired visual metaphors (waypoints, trails, fog-of-war) styled with existing shadcn theme tokens.

1. **Thread Map** — tab within the thread page showing the branching conversation tree as a spatial graph
2. **Knowledge Graph** — standalone page (`/knowledge-graph`) showing all learned concepts with mastery encoding and prerequisite edges

## Backend Changes

### BranchPoint Model

Add two fields to `BranchPoint` in `app/models/branch_point.py`:

- `source_concept: str | None = None` — the concept the user was learning when they branched
- `branch_topic: str | None = None` — the sub-topic they branched into

### Populate on Branch Creation

In the branch creation endpoint, when creating the child thread and BranchPoint:

- Read the parent thread's `current_concept` and set it as `source_concept` on the BranchPoint
- Use the `branch_text` (already sent by the client) as `branch_topic` on the BranchPoint (this is the same value stored on `Thread.branch_text` — the BranchPoint copy keeps graph queries self-contained without joining to threads)

### New API Endpoints

#### `GET /api/threads/{threadId}/map`

Returns the thread tree with concept context, flattened into nodes and edges for React Flow consumption.

Response shape:

```json
{
  "nodes": [
    {
      "thread_id": "...",
      "title": "...",
      "phase": "teaching",
      "depth": 0,
      "current_concept": "Ownership Rules",
      "summary": "...",
      "status": "active",
      "progress": 0.6
    }
  ],
  "edges": [
    {
      "source": "parent_thread_id",
      "target": "child_thread_id",
      "source_concept": "Ownership Rules",
      "branch_topic": "Borrow Checker"
    }
  ]
}
```

Implementation: reuse the tree-walking logic from the existing `GET /threads/{thread_id}/tree` endpoint in `chat.py` (lines 499-532), but flatten into nodes/edges format and enrich with progress and concept data. Extract shared tree-walk helper to avoid duplication. Progress is computed by parsing the thread's plan from disk — acceptable cost for typical tree sizes (< 20 threads). Branch threads that have no plan of their own return `progress: null`.

#### `GET /api/knowledge-graph`

Returns all concepts with mastery data and prerequisite relationships.

Response shape:

```json
{
  "concepts": [
    {
      "name": "Ownership Rules",
      "mastery_score": 0.75,
      "strength_trend": "improving",
      "threads": ["thread_id_1"],
      "last_reviewed": "2026-03-10T..."
    }
  ],
  "prerequisites": [
    { "source": "Variables & Types", "target": "Ownership Rules" }
  ]
}
```

Implementation: query all `ConceptMastery` documents for the user (single implicit user — no auth, same as existing endpoints). Extract prerequisite relationships from learning plans on disk (each `PlanConcept` has a `prerequisites` list in the schema). Deduplicate concepts that appear across multiple plans.

**Thread-to-concept mapping**: derive by scanning all threads with `topic_slug` and parsing their plans — each plan's concepts belong to that thread. Store this as a lookup, not a new DB field.

**Prerequisite data**: the `prerequisites` field exists on the `PlanConcept` Pydantic schema (used for structured LLM output) but may not survive the markdown round-trip through `plan_parser.py`. Two options:
1. Extend `plan_parser.py` to parse prerequisite annotations from the markdown (if the `create_plan` tool embeds them)
2. Store the structured `LearningPlan` JSON alongside the markdown in `plans/<slug>/plan.json` during plan creation, and read prerequisites from there

Option 2 is simpler and more reliable. To implement: modify the `create_plan` tool in `tools_impl.py` to use structured output (the `LearningPlan` Pydantic schema with `response_format`) to get a JSON object first, then render it to markdown. Save the JSON as `plans/<slug>/plan.json` alongside the existing `plan.md`. This requires changing the LLM call in `create_plan` from free-form markdown generation to structured output.

**Mastery system dependency**: the mastery scoring is defined but not yet wired into the agent loop. The knowledge graph should work in a degraded mode: show all concepts from plans with mastery_score = 0.0 (all "undiscovered" fog treatment). As mastery scoring gets wired in, nodes will light up naturally.

## Frontend Changes

### New Dependency

Add `@xyflow/react` and `@dagrejs/dagre` to the client.

### Shared Graph Components (`components/graph/`)

#### `ConceptNode`

Custom React Flow node for concept display. Shows:
- Concept name
- Mastery score as a small arc/ring indicator
- Strength trend indicator (arrow up/down/neutral)
- Visual mastery encoding using shadcn tokens:
  - Mastered (0.7+): solid `--primary` border
  - Medium (0.4-0.7): `--muted-foreground` border
  - Weak (below 0.4): dashed border, faded opacity
  - Not attempted: very low opacity, blurred — "undiscovered" fog treatment

#### `ThreadNode`

Custom React Flow node for thread display. Shows:
- Thread title
- Phase badge (interview / planning / teaching)
- Current concept name (if in teaching phase)
- Thin progress bar
- Root node: slightly larger with bolder border

#### `TrailEdge`

Custom React Flow edge styled as a dashed trail line using `--border` color. Supports an optional label (for `branch_topic` on thread map edges).

#### `PreviewPanel`

Floating panel that slides in from the right when a node is clicked. Receives node data as props and renders contextual details. Includes action buttons ("Go to chat", "View in Knowledge Graph", etc.). Closes on click-outside or escape.

#### `GraphBackground`

Wrapper around React Flow's `<Background variant="dots">` using `--muted` color for the dot grid.

### Thread Map Tab

The `graph-mode` tab trigger already exists in `top-bar.tsx` (NetworkIcon). Wire it to content in `main-content.tsx` (currently only `plan-mode` has content).

Tab content: full-height React Flow canvas. The graph tab should remount on each switch (not stay mounted hidden) — `fitView` on load handles viewport reset, and keeping React Flow instances alive when hidden wastes memory.

Data: fetched via `GET /api/threads/{threadId}/map`, transformed into React Flow nodes/edges format.

Layout: dagre, top-to-bottom. Root thread at top, branches below. Computed once on data load.

Interactions:
- Click node → PreviewPanel with thread details (title, summary, phase, concepts, progress). "Go to chat" button navigates to thread. "View in Knowledge Graph" link.
- Pan/zoom the canvas
- `fitView` on initial load

### Knowledge Graph Page

Route: `/knowledge-graph` (sidebar link already exists).

Full-page React Flow canvas.

Data: fetched via `GET /api/knowledge-graph`, transformed into React Flow nodes/edges format.

Layout: dagre, left-to-right. Concepts with no prerequisites on the left, dependent concepts flow rightward.

Interactions:
- Click concept → PreviewPanel with mastery breakdown, strength trend, linked threads, last reviewed, weak subconcepts. "Go to thread" links.
- Pan/zoom the canvas
- `fitView` on initial load

Cross-linking: supports `?focus=ConceptName` query param (URL-encoded). On load, if `focus` is set, center viewport on that concept (case-insensitive match) and open its preview panel.

### Empty, Loading, and Error States

**Thread Map**:
- Loading: centered spinner (reuse existing `thinking-orb`)
- Single node (no branches): show the single root node centered with a message "No branches yet — explore a sub-topic to grow the tree"
- Error: simple error message with retry button

**Knowledge Graph**:
- Loading: centered spinner
- No concepts (no plans exist): empty state with icon and "Start a learning thread to build your knowledge map"
- All concepts at 0.0 mastery (mastery not wired yet): show all nodes in fog/undiscovered state — the graph structure is still useful for seeing prerequisites
- Error: simple error message with retry button

### Styling

All graph components use shadcn theme tokens exclusively:
- `--background`, `--foreground` for canvas and text
- `--primary` for mastered/active elements
- `--muted`, `--muted-foreground` for secondary elements
- `--border` for edges and node borders
- `--accent` for hover states
- Dark/light mode via `colorMode` prop on ReactFlow, synced with next-themes

Cartographic feel achieved through:
- Dashed trail edges (CSS `stroke-dasharray`)
- Dot grid background
- Fog-of-war opacity/blur on undiscovered nodes
- Waypoint-style node shapes (rounded cards with subtle pin accent)

## Data Flow

```
Thread Map:
  useQuery("thread-map", threadId)
    → GET /api/threads/{threadId}/map
    → transform to React Flow nodes/edges
    → dagre layout
    → render

Knowledge Graph:
  useQuery("knowledge-graph")
    → GET /api/knowledge-graph
    → transform to React Flow nodes/edges
    → dagre layout
    → render

Cross-link:
  Thread Map PreviewPanel
    → "View in Knowledge Graph" click
    → router.push("/knowledge-graph?focus=ConceptName")
    → Knowledge Graph reads ?focus, centers viewport, opens preview
```

## File Structure

```
backend/app/
  models/branch_point.py          # add source_concept, branch_topic fields
  api/chat.py                     # update branch creation to populate new fields
  api/graph.py                    # new: thread map + knowledge graph endpoints

client/
  components/graph/
    concept-node.tsx              # ConceptNode custom node
    thread-node.tsx               # ThreadNode custom node
    trail-edge.tsx                # TrailEdge custom edge
    preview-panel.tsx             # floating detail panel
    graph-background.tsx          # themed dot background wrapper
    thread-map.tsx                # Thread Map tab content (React Flow canvas)
  app/knowledge-graph/page.tsx    # Knowledge Graph page
  hooks/use-thread-map.ts         # data fetching for thread map
  hooks/use-knowledge-graph.ts    # data fetching for knowledge graph
  lib/api.ts                      # add fetchThreadMap, fetchKnowledgeGraph
  lib/graph-layout.ts             # shared dagre layout helper (TB for thread map, LR for knowledge graph)
```
