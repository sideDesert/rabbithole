# Memory-Enriched Knowledge Graph

## Problem

The concept extractor only analyzes the last 20 messages in a single thread. It captures a snapshot but misses the evolution of understanding across conversations. A `confused_with` edge created on day 1 persists forever even if the learner resolved the confusion by day 5. Cross-thread concept connections are invisible.

## Solution

Enhance `extract_and_update_graph()` in `concept_extractor.py` with two additions:

1. **Time-based decay** on `confused_with` edges so stale confusions fade naturally.
2. **Memory enrichment pass** that queries EverMemOS memcells (episodic + profile) for each extracted concept and uses an LLM to update edges and mastery based on longitudinal evidence.

## Data Flow

```
Phase 1 (existing, unchanged):
  messages → LLM → concepts/confusions/trail → upsert MongoDB

Phase 2 (new — decay):
  For all confused_with edges for this user:
    days_stale = (now - updated_at).days
    weight *= 0.95 ^ days_stale
    Delete if weight < 0.05

Phase 3 (new — memory enrichment):
  Collect concept names from Phase 1
  For each concept: search_memories(query=name, memory_types=["episodic_memory", "profile"])
  Load existing edges for those concepts from MongoDB
  Single LLM call: memcells + edges + mastery scores → edge_updates + mastery_adjustments
  Apply updates to MongoDB
```

## Decay Mechanics

- **Scope**: Only `confused_with` edges. Structural edges (`prerequisite_of`, `part_of`) don't decay.
- **Rate**: `weight *= 0.95 ^ days_since_last_update` — a confusion untouched for 14 days drops from 1.0 to ~0.46.
- **Cleanup**: Edges with weight < 0.05 are deleted.
- **Trigger**: Runs on every extraction call, before the enrichment LLM call.

## Enrichment LLM Prompt

Input context:
- Memcells from EverMemOS (episodic + profile) for each concept
- Existing edges from MongoDB (all edges where concept is from or to)
- Current mastery score and confidence for each concept

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

- `edge_updates`: Create new edges or update weights on existing ones. LLM can lower weights (confusion resolved) or raise them (relationship strengthened).
- `mastery_adjustments`: Optional mastery score bump/drop based on cross-conversation evidence. Includes confidence override since memory-backed evidence is stronger than single-conversation extraction.
- All extracted concepts are batched into a single LLM call.

## Integration

All changes are in `backend/app/services/concept_extractor.py`. No new files or endpoints.

```
async def _do_extraction(thread_id, user_id, topic_slug):
    # Phase 1: conversation extraction (unchanged)
    ...
    # Phase 2: decay
    await _apply_confusion_decay(user_id)
    # Phase 3: memory enrichment
    await _enrich_from_memcells(user_id, concept_names)
```

### Dependencies
- `app.memory.evermemos.search_memories` — already exists, no changes needed.
- `app.db.mongo` — existing collections (`concept_mastery`, `concept_relationships`), no schema changes.
- Graph API endpoint (`app/api/graph.py`) — reads from same collections, no changes needed.

## Error Handling

- EverMemOS queries fail → log warning, skip enrichment. Phase 1 results still saved.
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

- `backend/app/services/concept_extractor.py` — add `_apply_confusion_decay()`, `_enrich_from_memcells()`, enrichment prompt, update `_do_extraction()` to call them.
