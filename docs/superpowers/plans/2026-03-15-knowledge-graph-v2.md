# Knowledge Graph V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat plan-derived knowledge graph with a living graph that grows from real conversations, with typed edges, domain grouping, and per-session concept extraction.

**Architecture:** Extend the existing `ConceptMastery` model with domain/source/confidence/description fields (no new collections for nodes). Add a `concept_relationships` collection for typed edges. Seed the graph at plan creation time, then enrich it via a background concept extractor that fires when teaching tools are called (`update_plan_progress`, `trigger_feynman`, `suggest_branches`). Frontend keeps React Flow + dagre but gains edge type styling, domain color-coding, confidence opacity, and a domain filter.

**Tech Stack:** Python/FastAPI (backend), MongoDB (data), OpenRouter LLM (extraction), React Flow + dagre (frontend visualization), TanStack Query (data fetching)

---

## File Structure

### Backend (create)
- `backend/app/models/concept_relationship.py` — `ConceptRelationship` Pydantic model
- `backend/app/services/concept_extractor.py` — LLM extraction + graph update logic

### Backend (modify)
- `backend/app/models/mastery.py` — add fields to `ConceptMastery`
- `backend/app/db/mongo.py` — add `concept_relationships()` collection accessor
- `backend/app/tools_impl.py` — seed graph in `create_plan`, fire extractor in teaching tools
- `backend/app/api/graph.py` — rewrite `GET /knowledge-graph` to read from MongoDB
- `backend/app/api/chat.py` — fire extractor background task on tool signals

### Frontend (modify)
- `client/lib/api.ts` — update `KnowledgeConcept` and `KnowledgeEdge` types, update `fetchKnowledgeGraph`
- `client/hooks/use-knowledge-graph.ts` — add domain filter param
- `client/components/graph/concept-node.tsx` — domain color border, confidence opacity, size scaling
- `client/components/graph/trail-edge.tsx` — 4 edge type styles
- `client/app/knowledge-graph/page.tsx` — domain filter dropdown, updated PreviewPanel content

---

## Chunk 1: Backend Data Model + Graph Seeding

### Task 1: Extend ConceptMastery model

**Files:**
- Modify: `backend/app/models/mastery.py:9-19`

- [ ] **Step 1: Add new fields to ConceptMastery**

Open `backend/app/models/mastery.py` and add four fields to the existing `ConceptMastery` class:

```python
class ConceptMastery(MongoBase):
    user_id: str
    concept_name: str
    mastery_score: float = 0.0
    attempts: int = 0
    last_reviewed: datetime | None = None
    last_score: float = 0.0
    score_history: list[float] = []
    weak_subconcepts: list[str] = []
    strength_trend: Literal["improving", "stable", "declining"] = "stable"
    related_concepts: list[str] = []
    # V2 fields
    domain: str = ""  # topic_slug this concept belongs to
    source: Literal["plan", "extracted", "prerequisite"] = "plan"
    confidence: float = 1.0  # 0.0-1.0, how certain the system is
    description: str = ""  # one-line description from plan or extraction
```

- [ ] **Step 2: Verify backend still starts**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.models.mastery import ConceptMastery; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/mastery.py
git commit -m "feat: add domain, source, confidence, description to ConceptMastery"
```

---

### Task 2: Create ConceptRelationship model

**Files:**
- Create: `backend/app/models/concept_relationship.py`
- Modify: `backend/app/db/mongo.py`

- [ ] **Step 1: Create the model file**

Create `backend/app/models/concept_relationship.py`:

```python
from typing import Literal

from app.models.base import MongoBase


class ConceptRelationship(MongoBase):
    """Edge in the knowledge graph between two concepts."""

    user_id: str
    from_concept: str  # concept_name of source node
    to_concept: str  # concept_name of target node
    type: Literal["prerequisite_of", "part_of", "explored_from", "confused_with"]
    weight: float = 1.0  # 0.0-1.0, strength of relationship
    source_thread: str = ""  # thread_id where this was detected
```

- [ ] **Step 2: Add collection accessor to mongo.py**

Add to `backend/app/db/mongo.py` after the `feynman_hints` function:

```python
def concept_relationships() -> Collection[dict[str, Any]]:
    return get_db()["concept_relationships"]
```

- [ ] **Step 3: Verify import works**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.models.concept_relationship import ConceptRelationship; from app.db.mongo import concept_relationships; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/concept_relationship.py backend/app/db/mongo.py
git commit -m "feat: add ConceptRelationship model and collection accessor"
```

---

### Task 3: Seed graph from create_plan

**Files:**
- Modify: `backend/app/tools_impl.py:159-224`

When `create_plan` runs, it already parses the plan into phases/concepts and saves `plan.json`. We'll add graph seeding after the JSON save — upsert `ConceptMastery` docs for each concept and create `ConceptRelationship` edges for sequential prerequisites within phases.

- [ ] **Step 1: Add imports to tools_impl.py**

Add these imports at the top of `backend/app/tools_impl.py`:

```python
from app.db import mongo
from app.models.mastery import ConceptMastery
from app.models.concept_relationship import ConceptRelationship
```

Note: `mongo` may already be imported indirectly — check and avoid duplicates.

- [ ] **Step 2: Add _seed_graph_from_plan helper function**

Add this function before `create_plan` in `backend/app/tools_impl.py`:

```python
def _seed_graph_from_plan(
    user_id: str, topic_slug: str, plan_data: dict[str, Any]
) -> None:
    """Upsert concept nodes and prerequisite edges from a freshly created plan."""
    for phase in plan_data.get("phases", []):
        phase_concepts = phase.get("concepts", [])
        prev_name: str | None = None
        for concept in phase_concepts:
            name = concept["name"]
            description = concept.get("description", "")

            # Upsert concept node (don't overwrite mastery if it already exists)
            mongo.concept_mastery().update_one(
                {"user_id": user_id, "concept_name": name},
                {
                    "$setOnInsert": {
                        "mastery_score": 0.0,
                        "attempts": 0,
                        "score_history": [],
                        "strength_trend": "stable",
                        "confidence": 1.0,
                        "source": "plan",
                        "created_at": __import__("datetime").datetime.now(
                            __import__("datetime").timezone.utc
                        ),
                    },
                    "$set": {
                        "domain": topic_slug,
                        "description": description,
                        "updated_at": __import__("datetime").datetime.now(
                            __import__("datetime").timezone.utc
                        ),
                    },
                },
                upsert=True,
            )

            # Create prerequisite edge from previous concept in phase
            if prev_name:
                mongo.concept_relationships().update_one(
                    {
                        "user_id": user_id,
                        "from_concept": prev_name,
                        "to_concept": name,
                        "type": "prerequisite_of",
                    },
                    {
                        "$setOnInsert": {
                            "weight": 1.0,
                            "source_thread": "",
                            "created_at": __import__("datetime").datetime.now(
                                __import__("datetime").timezone.utc
                            ),
                        },
                        "$set": {
                            "updated_at": __import__("datetime").datetime.now(
                                __import__("datetime").timezone.utc
                            ),
                        },
                    },
                    upsert=True,
                )
            prev_name = name
```

- [ ] **Step 3: Call _seed_graph_from_plan inside create_plan**

In the `create_plan` function, add this call after the line that writes `plan.json` (after line 214):

```python
    # Seed knowledge graph with concepts and prerequisite edges
    _seed_graph_from_plan(ctx.context.user_id, slug, plan_data)
```

- [ ] **Step 4: Verify backend starts and create_plan import works**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.tools_impl import create_plan; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/tools_impl.py
git commit -m "feat: seed knowledge graph nodes and edges when plan is created"
```

---

### Task 4: Rewrite GET /knowledge-graph endpoint

**Files:**
- Modify: `backend/app/api/graph.py:125-172`

Replace the plan-file-scanning approach with direct MongoDB queries. The endpoint should return nodes from `concept_mastery` and edges from `concept_relationships`.

- [ ] **Step 1: Rewrite the endpoint**

Replace the `get_knowledge_graph` function and `_load_all_plans` / `_find_threads_for_slug` helpers in `backend/app/api/graph.py`:

```python
@router.get("/knowledge-graph")
def get_knowledge_graph(user_id: str = "user_001", domain: str | None = None):
    """Return the learner's knowledge graph: concept nodes + relationship edges."""
    query: dict[str, str] = {"user_id": user_id}
    if domain:
        query["domain"] = domain

    concept_docs = list(mongo.get_db()["concept_mastery"].find(query))
    rel_docs = list(mongo.get_db()["concept_relationships"].find({"user_id": user_id}))

    # If domain filter is active, only include edges where both ends are in result set
    concept_names = {doc.get("concept_name", "") for doc in concept_docs}

    nodes = []
    for doc in concept_docs:
        # Find thread IDs that use this concept's domain (topic_slug)
        domain_slug = doc.get("domain", "")
        thread_ids: list[str] = []
        if domain_slug:
            thread_docs = mongo.threads().find(
                {"topic_slug": domain_slug}, {"_id": 1}
            )
            thread_ids = [str(t["_id"]) for t in thread_docs]

        nodes.append({
            "name": doc.get("concept_name", ""),
            "mastery_score": doc.get("mastery_score", 0.0),
            "strength_trend": doc.get("strength_trend", "stable"),
            "threads": thread_ids,
            "last_reviewed": str(doc["last_reviewed"]) if doc.get("last_reviewed") else None,
            "domain": doc.get("domain", ""),
            "source": doc.get("source", "plan"),
            "confidence": doc.get("confidence", 1.0),
            "description": doc.get("description", ""),
            "weak_subconcepts": doc.get("weak_subconcepts", []),
        })

    edges = []
    for doc in rel_docs:
        from_c = doc.get("from_concept", "")
        to_c = doc.get("to_concept", "")
        # If filtering by domain, skip edges that cross out of the filtered set
        if domain and (from_c not in concept_names or to_c not in concept_names):
            continue
        edges.append({
            "source": from_c,
            "target": to_c,
            "type": doc.get("type", "prerequisite_of"),
            "weight": doc.get("weight", 1.0),
        })

    # Collect unique domains for filter dropdown
    domains = sorted({n["domain"] for n in nodes if n["domain"]})

    return {"nodes": nodes, "edges": edges, "domains": domains}
```

You can delete `_load_all_plans` and `_find_threads_for_slug` — they're no longer used. Keep `_thread_plan_info` (used by `get_thread_map`).

- [ ] **Step 2: Remove unused import**

Remove the `json as _json` import from the top of `graph.py` (no longer needed). Keep the `parse_plan` and `PLANS_DIR` imports since `_thread_plan_info` still uses them.

- [ ] **Step 3: Verify endpoint loads**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.graph import router; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/graph.py
git commit -m "feat: rewrite knowledge-graph endpoint to read from MongoDB"
```

---

## Chunk 2: Concept Extractor Service

### Task 5: Create the concept extractor

**Files:**
- Create: `backend/app/services/concept_extractor.py`

This service loads recent messages from a thread, calls the LLM to extract concepts + relationships, then upserts into MongoDB. It's designed to be called as a background task.

- [ ] **Step 1: Create the extractor module**

Create `backend/app/services/concept_extractor.py`:

```python
"""Extract concepts and relationships from teaching conversations.

Called as a background task when teaching tools fire (update_plan_progress,
trigger_feynman, suggest_branches). Idempotent — safe to call multiple
times on the same thread.
"""

import json
import logging
from datetime import datetime, timezone

from openai import AsyncOpenAI

from app.config import LLM_API_KEY, LLM_BASE_URL, DEFAULT_MODEL
from app.db import mongo

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """\
You are analyzing a learning conversation. Extract structured information about \
what concepts the learner engaged with and how they connected.

Given the conversation, return a JSON object with:

1. "concepts": array of objects, each with:
   - "name": string — concept name (use the plan's concept name if it matches)
   - "engagement": "surface" | "explained" | "applied"
     - surface: mentioned or briefly discussed
     - explained: learner explained it back or asked detailed questions
     - applied: learner used it to solve a problem or make connections

2. "confusions": array of objects, each with:
   - "concept_a": string — first concept name
   - "concept_b": string — second concept name
   - "note": string — brief description of the confusion

3. "trail": array of objects, each with:
   - "from": string — concept that led to exploration
   - "to": string — concept that was explored next

Return ONLY valid JSON. If nothing meaningful was discussed, return:
{"concepts": [], "confusions": [], "trail": []}
"""

MASTERY_DELTA = {
    "surface": 0.05,
    "explained": 0.15,
    "applied": 0.25,
}


async def extract_and_update_graph(
    thread_id: str, user_id: str, topic_slug: str
) -> None:
    """Extract concepts from recent messages and update the knowledge graph.

    Designed to run as a FastAPI background task. Errors are logged, not raised.
    """
    try:
        await _do_extraction(thread_id, user_id, topic_slug)
    except Exception as e:
        logger.error(
            "[extractor] failed for thread=%s: %s", thread_id, e, exc_info=True
        )


async def _do_extraction(
    thread_id: str, user_id: str, topic_slug: str
) -> None:
    # Load last N messages from this thread (skip tool calls)
    docs = list(
        mongo.messages()
        .find(
            {
                "thread_id": thread_id,
                "type": {"$in": ["text", "markdown"]},
            }
        )
        .sort("created_at", -1)
        .limit(20)
    )
    if len(docs) < 2:
        logger.info("[extractor] skipping thread=%s — too few messages", thread_id)
        return

    # Build transcript (oldest first)
    docs.reverse()
    transcript_lines = []
    for doc in docs:
        role = "Learner" if doc["role"] == "user" else "Teacher"
        content = str(doc.get("content", ""))
        if len(content) > 600:
            content = content[:600] + "..."
        transcript_lines.append(f"{role}: {content}")

    transcript = "\n".join(transcript_lines)

    # Call LLM for extraction
    llm = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)
    response = await llm.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": transcript},
        ],
        max_tokens=1000,
    )

    raw = response.choices[0].message.content or ""

    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]) if len(lines) > 2 else raw

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("[extractor] LLM returned invalid JSON: %s", raw[:200])
        return

    now = datetime.now(timezone.utc)
    concepts = data.get("concepts", [])
    confusions = data.get("confusions", [])
    trail = data.get("trail", [])

    logger.info(
        "[extractor] thread=%s extracted %d concepts, %d confusions, %d trail edges",
        thread_id,
        len(concepts),
        len(confusions),
        len(trail),
    )

    # Upsert concept nodes
    for c in concepts:
        name = c.get("name", "").strip()
        if not name:
            continue
        engagement = c.get("engagement", "surface")
        delta = MASTERY_DELTA.get(engagement, 0.05)

        existing = mongo.concept_mastery().find_one(
            {"user_id": user_id, "concept_name": name}
        )
        if existing:
            # Bump mastery by engagement delta (capped at 1.0)
            new_score = min(existing.get("mastery_score", 0.0) + delta, 1.0)
            mongo.concept_mastery().update_one(
                {"user_id": user_id, "concept_name": name},
                {
                    "$set": {
                        "mastery_score": new_score,
                        "updated_at": now,
                    }
                },
            )
        else:
            # New concept discovered in conversation
            mongo.concept_mastery().insert_one({
                "user_id": user_id,
                "concept_name": name,
                "mastery_score": delta,
                "attempts": 0,
                "score_history": [],
                "strength_trend": "stable",
                "weak_subconcepts": [],
                "related_concepts": [],
                "domain": topic_slug,
                "source": "extracted",
                "confidence": 0.7,
                "description": "",
                "last_reviewed": now,
                "last_score": 0.0,
                "created_at": now,
                "updated_at": now,
            })

    # Upsert confusion edges
    for conf in confusions:
        a = conf.get("concept_a", "").strip()
        b = conf.get("concept_b", "").strip()
        if not a or not b:
            continue
        mongo.concept_relationships().update_one(
            {
                "user_id": user_id,
                "from_concept": a,
                "to_concept": b,
                "type": "confused_with",
            },
            {
                "$setOnInsert": {"created_at": now},
                "$set": {
                    "weight": 1.0,
                    "source_thread": thread_id,
                    "updated_at": now,
                },
            },
            upsert=True,
        )

    # Upsert exploration trail edges
    for edge in trail:
        from_c = edge.get("from", "").strip()
        to_c = edge.get("to", "").strip()
        if not from_c or not to_c:
            continue
        mongo.concept_relationships().update_one(
            {
                "user_id": user_id,
                "from_concept": from_c,
                "to_concept": to_c,
                "type": "explored_from",
            },
            {
                "$setOnInsert": {"created_at": now, "weight": 0.5},
                "$set": {
                    "source_thread": thread_id,
                    "updated_at": now,
                },
            },
            upsert=True,
        )
```

- [ ] **Step 2: Verify import works**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.services.concept_extractor import extract_and_update_graph; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/concept_extractor.py
git commit -m "feat: add concept extractor service for knowledge graph enrichment"
```

---

### Task 6: Wire extractor to tool signals in chat.py

**Files:**
- Modify: `backend/app/api/chat.py:860-936`

Fire the extractor as a background task when teaching tools are called. We detect this from the existing `tool_names_called` list.

- [ ] **Step 1: Add import to chat.py**

Add at the top of `backend/app/api/chat.py` with the other imports:

```python
from app.services.concept_extractor import extract_and_update_graph
```

- [ ] **Step 2: Add extractor trigger after agent run completes**

In the `stream()` function inside `chat`, find the section after step 9 (save assistant response) and before step 10 (emit interview questions). Add this block after the `yield _status("save_response", ...)` line (~line 975):

```python
        # 9c. Fire concept extractor if teaching tools were called
        EXTRACTOR_TRIGGERS = {"update_plan_progress", "trigger_feynman", "suggest_branches"}
        if phase == "teaching" and EXTRACTOR_TRIGGERS & set(tool_names_called):
            from fastapi.concurrency import run_in_threadpool
            import asyncio

            async def _fire_extractor():
                try:
                    await extract_and_update_graph(thread_id, user_id, topic_slug)
                except Exception as e:
                    logger.warning("[chat] extractor failed: %s", e)

            asyncio.ensure_future(_fire_extractor())
            logger.info("[chat] concept extractor fired for thread=%s", thread_id)
```

- [ ] **Step 3: Verify backend starts**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.chat import router; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/chat.py
git commit -m "feat: fire concept extractor on teaching tool signals"
```

---

## Chunk 3: Frontend — Types, Edge Styling, Node Styling

### Task 7: Update API types

**Files:**
- Modify: `client/lib/api.ts:517-534`

- [ ] **Step 1: Update KnowledgeConcept and KnowledgeGraphData types**

Replace the existing types in `client/lib/api.ts`:

```typescript
export interface KnowledgeConcept {
  name: string;
  mastery_score: number;
  strength_trend: "improving" | "stable" | "declining";
  threads: string[];
  last_reviewed: string | null;
  domain: string;
  source: "plan" | "extracted" | "prerequisite";
  confidence: number;
  description: string;
  weak_subconcepts: string[];
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  type: "prerequisite_of" | "part_of" | "explored_from" | "confused_with";
  weight: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeConcept[];
  edges: KnowledgeEdge[];
  domains: string[];
}
```

- [ ] **Step 2: Update fetchKnowledgeGraph to accept domain filter**

Replace the existing `fetchKnowledgeGraph` function:

```typescript
export async function fetchKnowledgeGraph(domain?: string): Promise<KnowledgeGraphData> {
  const params = new URLSearchParams();
  if (domain) params.set("domain", domain);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/knowledge-graph${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`Failed to fetch knowledge graph: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Remove old prerequisites type reference**

The old `KnowledgeGraphData` had a `concepts` and `prerequisites` shape. Search the codebase for any references to `data.concepts` or `data.prerequisites` in the knowledge graph page — these will be updated in Task 10. For now just update the types.

- [ ] **Step 4: Commit**

```bash
git add client/lib/api.ts
git commit -m "feat: update knowledge graph API types for v2 schema"
```

---

### Task 8: Update TrailEdge with typed edge styles

**Files:**
- Modify: `client/components/graph/trail-edge.tsx`

- [ ] **Step 1: Rewrite TrailEdge to support 4 edge types**

Replace the contents of `client/components/graph/trail-edge.tsx`:

```tsx
import { EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

type EdgeType = "prerequisite_of" | "part_of" | "explored_from" | "confused_with";

interface TrailEdgeData {
  branch_topic?: string | null;
  edgeType?: EdgeType;
}

const EDGE_STYLES: Record<EdgeType, { stroke: string; dasharray?: string; opacity: number }> = {
  prerequisite_of: { stroke: "hsl(var(--primary))", opacity: 0.8 },
  part_of: { stroke: "hsl(var(--muted-foreground))", opacity: 0.5 },
  explored_from: { stroke: "hsl(45, 93%, 47%)", dasharray: "6 4", opacity: 0.7 },
  confused_with: { stroke: "hsl(0, 84%, 60%)", dasharray: "4 4", opacity: 0.8 },
};

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
  const edgeType = edgeData?.edgeType ?? "prerequisite_of";
  const style = EDGE_STYLES[edgeType];

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.stroke}
        strokeWidth={2}
        strokeDasharray={style.dasharray}
        strokeOpacity={style.opacity}
      >
        {style.dasharray && (
          <animate
            attributeName="stroke-dashoffset"
            from="20"
            to="0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        )}
      </path>
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
git add client/components/graph/trail-edge.tsx
git commit -m "feat: style knowledge graph edges by relationship type"
```

---

### Task 9: Update ConceptNode with domain color and confidence

**Files:**
- Modify: `client/components/graph/concept-node.tsx`

- [ ] **Step 1: Rewrite ConceptNode**

Replace the contents of `client/components/graph/concept-node.tsx`:

```tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConceptNodeData {
  name: string;
  mastery_score: number;
  strength_trend: "improving" | "stable" | "declining";
  domain: string;
  source: "plan" | "extracted" | "prerequisite";
  confidence: number;
}

// Deterministic color from domain string — maps to hsl hue
function domainHue(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
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
  const confidence = d.confidence ?? 1.0;

  const isMastered = score >= 0.7;
  const isMedium = score >= 0.4 && score < 0.7;
  const isWeak = score > 0 && score < 0.4;
  const isUndiscovered = score === 0;

  const hue = d.domain ? domainHue(d.domain) : 0;
  const domainBorder = d.domain ? `hsl(${hue}, 60%, 50%)` : undefined;

  return (
    <div
      className={cn(
        "bg-card rounded-lg px-4 py-3 min-w-[180px] max-w-[240px] cursor-pointer transition-all",
        isMastered && "border-2 border-primary shadow-sm",
        isMedium && "border border-muted-foreground",
        isWeak && "border border-dashed border-muted-foreground",
        isUndiscovered && "border border-dashed border-border",
        selected && "ring-2 ring-primary/50",
      )}
      style={{
        opacity: confidence < 0.5 ? 0.5 : confidence < 0.8 ? 0.75 : 1,
        borderLeftColor: domainBorder,
        borderLeftWidth: domainBorder ? 3 : undefined,
      }}
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
            {d.source === "extracted" && (
              <span className="text-[9px] text-muted-foreground/60 italic">inferred</span>
            )}
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
git add client/components/graph/concept-node.tsx
git commit -m "feat: add domain color and confidence opacity to concept nodes"
```

---

## Chunk 4: Frontend — Graph Page, Hook, Preview Panel

### Task 10: Update the knowledge graph page

**Files:**
- Modify: `client/hooks/use-knowledge-graph.ts`
- Modify: `client/app/knowledge-graph/page.tsx`

- [ ] **Step 1: Update the hook to support domain filter**

Replace `client/hooks/use-knowledge-graph.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeGraph } from "@/lib/api";

export function useKnowledgeGraph(domain?: string) {
  return useQuery({
    queryKey: ["knowledge-graph", domain ?? "all"],
    queryFn: () => fetchKnowledgeGraph(domain),
  });
}
```

- [ ] **Step 2: Rewrite the knowledge graph page**

Replace `client/app/knowledge-graph/page.tsx`:

```tsx
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
                <span>{selectedConcept.domain.replace(/-/g, " ") || "—"}</span>
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
```

- [ ] **Step 3: Commit**

```bash
git add client/hooks/use-knowledge-graph.ts client/app/knowledge-graph/page.tsx
git commit -m "feat: add domain filter, typed edges, and enriched preview to knowledge graph"
```

---

### Task 11: Re-enable Knowledge Graph in sidebar

**Files:**
- Modify: `client/components/app-sidebar.tsx`

The knowledge graph link is currently commented out in the sidebar.

- [ ] **Step 1: Uncomment the Knowledge Graph nav item**

Find the commented-out Knowledge Graph item in `client/components/app-sidebar.tsx` and uncomment it. It should link to `/knowledge-graph` with the `Network` icon from lucide-react.

- [ ] **Step 2: Commit**

```bash
git add client/components/app-sidebar.tsx
git commit -m "feat: re-enable knowledge graph link in sidebar"
```

---

### Task 12: Clean up _seed_graph_from_plan datetime imports

**Files:**
- Modify: `backend/app/tools_impl.py`

The `_seed_graph_from_plan` function in Task 3 uses inline `__import__("datetime")` for brevity in the plan. Clean this up to use the proper import.

- [ ] **Step 1: Add datetime import to tools_impl.py**

Add at the top of `backend/app/tools_impl.py`:

```python
from datetime import datetime, timezone
```

- [ ] **Step 2: Replace __import__ calls**

Replace all `__import__("datetime").datetime.now(__import__("datetime").timezone.utc)` with `datetime.now(timezone.utc)` in `_seed_graph_from_plan`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/tools_impl.py
git commit -m "chore: clean up datetime imports in graph seeding"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Extend ConceptMastery with v2 fields | `models/mastery.py` |
| 2 | Create ConceptRelationship model + collection | `models/concept_relationship.py`, `db/mongo.py` |
| 3 | Seed graph from create_plan | `tools_impl.py` |
| 4 | Rewrite GET /knowledge-graph | `api/graph.py` |
| 5 | Create concept extractor service | `services/concept_extractor.py` |
| 6 | Wire extractor to teaching tool signals | `api/chat.py` |
| 7 | Update frontend API types | `lib/api.ts` |
| 8 | Typed edge styles | `trail-edge.tsx` |
| 9 | Domain color + confidence opacity on nodes | `concept-node.tsx` |
| 10 | Graph page + hook + preview panel | `page.tsx`, `use-knowledge-graph.ts` |
| 11 | Re-enable sidebar link | `app-sidebar.tsx` |
| 12 | Clean up datetime imports | `tools_impl.py` |
