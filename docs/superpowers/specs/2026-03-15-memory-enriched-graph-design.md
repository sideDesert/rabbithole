# Memory-Enriched Knowledge Graph

## Problem

The concept extractor only analyzes the last 20 messages in a single thread. It captures a snapshot but misses the evolution of understanding across conversations. A `confused_with` edge created on day 1 persists forever even if the learner resolved the confusion by day 5. Cross-thread concept connections are invisible.

## Solution

Enhance `extract_and_update_graph()` in `concept_extractor.py` with two additions:

1. **Time-based decay** on `confused_with` edges so stale confusions fade naturally.
2. **Memory enrichment pass** that queries EverMemOS memcells (episodic + profile) for each extracted concept and uses an LLM to update edges and mastery based on longitudinal evidence.

## Data Flow

```
Phase 1 (existing, with one change — confused_with upsert uses $setOnInsert for weight):
  messages → LLM → concepts/confusions/trail → upsert MongoDB

Phase 2 (new — decay):
  For all confused_with edges for this user:
    days_stale = (now - updated_at).days
    weight *= 0.95 ^ days_stale
    Delete if weight < 0.05

Phase 3 (new — memory enrichment):
  Skip if enrichment ran within last 60s for this user (debounce)
  Collect concept names from Phase 1 (top 5 by engagement level)
  For each concept in parallel (asyncio.gather):
    search_memories(query=name, memory_types=["episodic_memory", "profile"])
  Load existing edges for those concepts from MongoDB
  Single LLM call: memcells + edges + mastery scores → edge_updates + mastery_adjustments
  Apply updates to MongoDB
```

## Phase 1 Change: Confused-With Weight Upsert

The existing Phase 1 hard-sets `weight: 1.0` on every `confused_with` upsert, which would reset any decay. Change the upsert to use `$setOnInsert` for weight so that:
- New confusion edges start at weight 1.0
- Re-extracted confusions update `updated_at` (resetting the decay clock) but preserve the current weight

## Decay Mechanics

- **Scope**: Only `confused_with` edges. Structural edges (`prerequisite_of`, `part_of`) don't decay.
- **Rate**: `weight *= 0.95 ^ days_since_last_update` — a confusion untouched for 14 days drops from 1.0 to ~0.46.
- **Cleanup**: Edges with weight < 0.05 are deleted.
- **Trigger**: Runs on every extraction call, after Phase 1, before the enrichment LLM call.
- **`updated_at` semantics**: Enrichment-driven weight updates DO reset `updated_at`, preventing further decay until the edge goes untouched again. This is intentional — if the enrichment LLM actively sets a weight, that's a fresh assessment.

## Enrichment Debounce

Phase 3 checks a simple marker before running:
- Before enrichment: check `last_enrichment_at` for this user in a module-level dict (in-memory, not persisted).
- Skip if less than 60 seconds since last enrichment.
- On completion: update `last_enrichment_at`.

This prevents triple-firing when multiple teaching tools trigger in quick succession on the same thread.

## Enrichment LLM Prompt

System prompt:

```
You are analyzing a learner's memory history to update their knowledge graph.

You will receive:
1. A list of concepts the learner recently engaged with
2. Memories from the learner's history (episodic memories and profile) for each concept
3. Existing relationship edges between concepts (with types and current weights)
4. Current mastery scores and confidence for each concept

Your job: determine what has CHANGED based on the memory evidence.

Return a JSON object with:

1. "edge_updates": array of edges to create or update, each with:
   - "from": concept name
   - "to": concept name
   - "type": "confused_with" | "explored_from" | "prerequisite_of" | "part_of"
   - "weight": 0.0-1.0 (for confused_with: lower = more resolved; for others: higher = stronger link)
   - "reason": brief explanation of what memory evidence supports this

2. "mastery_adjustments": array of mastery changes, each with:
   - "concept": concept name
   - "delta": float adjustment (-0.3 to +0.3) to add to current mastery score
   - "confidence": 0.0-1.0 — how confident this adjustment is based on memory evidence
   - "reason": brief explanation

Rules:
- Only propose changes supported by memory evidence. If memories don't mention a concept, skip it.
- For confused_with: lower the weight if memories show the learner later distinguished the concepts.
- For prerequisite_of/part_of: only create if memories show the learner explicitly connected the concepts.
- Keep mastery deltas conservative (-0.3 to +0.3). Memories supplement conversation evidence, they don't replace it.
- Return {"edge_updates": [], "mastery_adjustments": []} if no changes are warranted.
```

Input context (user message):
- Concepts with current mastery and confidence
- Memcells grouped by concept
- Existing edges

Output schema:
```json
{
  "edge_updates": [
    {
      "from": "pointer arithmetic",
      "to": "array indexing",
      "type": "confused_with",
      "weight": 0.2,
      "reason": "learner clarified distinction in later sessions"
    }
  ],
  "mastery_adjustments": [
    {
      "concept": "pointer arithmetic",
      "delta": 0.1,
      "confidence": 0.85,
      "reason": "multiple memories show applied understanding"
    }
  ]
}
```

## Applying Updates

### Edge updates
- Upsert each edge (same pattern as Phase 1).
- Set `weight` and `updated_at` on the edge.
- `reason` field is logged but not persisted (no schema changes).

### Mastery adjustments
- `delta` is additive to the current mastery score (which may have already been bumped by Phase 1).
- Final score clamped to `[0.0, 1.0]`.
- `confidence` applied via `$max` — only ratchets up, never down. Memory-backed evidence is stronger than the default 0.7 from initial extraction.

## Concept Selection

Phase 3 does not enrich all extracted concepts. Selection:
1. Sort Phase 1 concepts by engagement level: applied > explained > surface.
2. Take the top 5.
3. This caps EverMemOS queries at 5 (run in parallel via `asyncio.gather`).

## Integration

All changes are in `backend/app/services/concept_extractor.py`. No new files or endpoints.

```
async def _do_extraction(thread_id, user_id, topic_slug):
    # Phase 1: conversation extraction (confused_with weight uses $setOnInsert)
    ...
    # Phase 2: decay
    await _apply_confusion_decay(user_id)
    # Phase 3: memory enrichment (with debounce)
    await _enrich_from_memcells(user_id, concept_names)
```

### Dependencies
- `app.memory.evermemos.search_memories` — already exists, no changes needed. Falls back to unfiltered search if `memory_types` param is not supported on the search endpoint.
- `app.db.mongo` — existing collections (`concept_mastery`, `concept_relationships`), no schema changes.
- Graph API endpoint (`app/api/graph.py`) — reads from same collections, no changes needed.

## Error Handling

- EverMemOS queries fail → log warning, skip enrichment. Phase 1 results still saved.
- EverMemOS search endpoint doesn't support `memory_types` filter → fall back to unfiltered search (slightly noisier but functional).
- LLM returns invalid JSON → log warning, skip enrichment.
- No memcells found for a concept → skip that concept in the enrichment prompt.
- Entire enrichment phase wrapped in try/except — never breaks existing extraction.

## Edge Types Reference

| Type | Decays? | Source |
|------|---------|--------|
| `confused_with` | Yes (0.95/day) | Phase 1 extraction + Phase 3 enrichment |
| `explored_from` | No | Phase 1 extraction + Phase 3 enrichment |
| `prerequisite_of` | No | Phase 3 enrichment only |
| `part_of` | No | Phase 3 enrichment only |

## Files Modified

- `backend/app/services/concept_extractor.py` — change confused_with upsert to `$setOnInsert` for weight, add `_apply_confusion_decay()`, `_enrich_from_memcells()`, enrichment prompt, debounce logic, update `_do_extraction()` to call phases 2 and 3.
