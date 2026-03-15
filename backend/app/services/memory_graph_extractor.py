"""Extract entities and relationships from EverMemOS MemCells.

Called as a background task after chat sessions or manually via the sync
endpoint. Idempotent — safe to call multiple times for the same user.
"""

import json
import logging
from datetime import datetime, timezone

from openai import AsyncOpenAI
from pymongo import UpdateOne

from app.config import LLM_API_KEY, LLM_BASE_URL, DEFAULT_MODEL
from app.db import mongo
from app.memory import evermemos

logger = logging.getLogger(__name__)

_llm = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)

EXTRACTION_PROMPT = """\
You are analyzing a learner's memory records to build a knowledge graph of \
everything they know — concepts, people, facts, beliefs, and resources.

Given the memory records below, extract:

1. "entities": array of objects, each with:
   - "type": one of "concept", "person", "fact", "belief", "resource"
   - "slug": kebab-case unique identifier (e.g., "rust-ownership", "andrej-karpathy")
   - "name": human-readable display name (e.g., "Rust Ownership", "Andrej Karpathy")
   - Type-specific fields:
     - concept: "domain" (topic area, kebab-case), "mastery" (0.0-1.0 engagement depth)
     - person: "role" (e.g., "researcher", "professor", "author")
     - fact: "statement" (the atomic fact), "about_concept_slug" (parent concept), "verified" (true/false)
     - belief: "statement" (what the learner believes), "about_concept_slug" (parent concept), "correct" (true/false/null if unknown)
     - resource: "title", "url" (if known, else ""), "resource_type" ("book"/"article"/"video"/"conversation"/"docs")

2. "relationships": array of objects, each with:
   - "from_slug": source entity slug
   - "from_type": source entity type
   - "to_slug": target entity slug
   - "to_type": target entity type
   - "type": one of:
     - "part_of" — concept is part of a broader concept (child → parent)
     - "led_to" — exploring one concept led to another
     - "confused_with" — learner mixed up two concepts
     - "contradicts" — a belief contradicts a fact (belief → fact only)
     - "derived_from" — fact/belief came from a resource
     - "learned_from" — concept learned from a person or resource
   - "weight": 0.0-1.0 strength of evidence

Rules:
- Use consistent kebab-case slugs. Same entity = same slug always.
- Only emit relationships when there is explicit evidence.
- confused_with: only when the learner demonstrably mixed up two concepts.
- contradicts: only when a belief was explicitly corrected.
- Prefer sparse and accurate over dense and noisy.
- Every fact and belief MUST have an about_concept_slug pointing to a concept in your entities list.

Return ONLY valid JSON. No preamble. If nothing meaningful found:
{"entities": [], "relationships": []}
"""


async def extract_memory_graph(user_id: str) -> None:
    """Top-level entry point. Errors logged, not raised."""
    try:
        await _do_extraction(user_id)
    except Exception as e:
        logger.error(
            "[memory-graph] extraction failed for user=%s: %s",
            user_id, e, exc_info=True,
        )


async def _fetch_memcells(user_id: str) -> list[dict]:
    """Fetch MemCells from EverMemOS Cloud across memory types."""
    all_memcells: list[dict] = []
    for memory_type in ("episodic_memory", "profile"):
        for page in range(1, 6):
            try:
                resp = await evermemos.get_memories(
                    user_id=user_id,
                    memory_type=memory_type,
                    page=page,
                    page_size=20,
                )
                result = resp.get("result", {})
                if isinstance(result, dict):
                    memories = result.get("memories", [])
                else:
                    memories = resp.get("memories", [])
                if not memories:
                    break
                all_memcells.extend(memories)
            except Exception as e:
                logger.warning(
                    "[memory-graph] failed to fetch %s page %d: %s",
                    memory_type, page, e,
                )
                break
    return all_memcells


def _build_extraction_input(memcells: list[dict]) -> str:
    """Format MemCells into a text block for the LLM."""
    lines: list[str] = []
    for i, mc in enumerate(memcells, 1):
        mem_type = mc.get("memory_type", "unknown")
        text = (
            mc.get("episode")
            or mc.get("atomic_fact")
            or mc.get("summary")
            or mc.get("content", "")
        )
        if not text:
            continue
        if len(text) > 500:
            text = text[:500] + "..."
        lines.append(f"[{i}] [{mem_type}] {text}")
    combined = "\n\n".join(lines)
    if len(combined) > 8000:
        combined = combined[:8000] + "\n\n[truncated]"
    return combined


async def _do_extraction(user_id: str) -> None:
    memcells = await _fetch_memcells(user_id)
    if len(memcells) < 2:
        logger.info("[memory-graph] skipping user=%s — too few memcells (%d)", user_id, len(memcells))
        return

    input_text = _build_extraction_input(memcells)
    if not input_text.strip():
        logger.info("[memory-graph] skipping user=%s — no extractable content", user_id)
        return

    memcell_ids = [str(mc.get("id", mc.get("_id", ""))) for mc in memcells if mc.get("id") or mc.get("_id")]

    response = await _llm.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": input_text},
        ],
        max_tokens=2000,
    )

    raw = response.choices[0].message.content or ""

    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]) if len(lines) > 2 else raw

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("[memory-graph] LLM returned invalid JSON: %s", raw[:200])
        return

    entities = data.get("entities", [])
    relationships = data.get("relationships", [])

    logger.info(
        "[memory-graph] user=%s extracted %d entities, %d relationships",
        user_id, len(entities), len(relationships),
    )

    now = datetime.now(timezone.utc)
    _upsert_entities(user_id, entities, memcell_ids, now)
    _upsert_relationships(user_id, relationships, memcell_ids, now)


def _entity_set_fields(e: dict, name: str, etype: str, now: datetime) -> dict:
    """Build the $set fields for an entity upsert based on its type."""
    fields: dict = {"name": name, "last_seen": now, "updated_at": now}
    if etype == "concept":
        fields["domain"] = e.get("domain", "")
        mastery = e.get("mastery", 0.0)
        if isinstance(mastery, (int, float)):
            fields["mastery"] = mastery
        fields["confidence"] = e.get("confidence", 0.8)
    elif etype == "person":
        fields["role"] = e.get("role", "")
    elif etype == "fact":
        fields["statement"] = e.get("statement", "")
        fields["about_concept_slug"] = e.get("about_concept_slug", "")
        fields["verified"] = e.get("verified")
    elif etype == "belief":
        fields["statement"] = e.get("statement", "")
        fields["about_concept_slug"] = e.get("about_concept_slug", "")
        fields["correct"] = e.get("correct")
        fields["superseded_by"] = e.get("superseded_by", "")
    elif etype == "resource":
        fields["title"] = e.get("title", name)
        fields["url"] = e.get("url", "")
        fields["resource_type"] = e.get("resource_type", "")
    return fields


_VALID_ENTITY_TYPES = {"concept", "person", "fact", "belief", "resource"}


def _upsert_entities(
    user_id: str,
    entities: list[dict],
    memcell_ids: list[str],
    now: datetime,
) -> None:
    ops: list[UpdateOne] = []
    for e in entities:
        slug = e.get("slug", "").strip()
        etype = e.get("type", "").strip()
        name = e.get("name", "").strip()
        if not slug or not etype or not name or etype not in _VALID_ENTITY_TYPES:
            continue

        ops.append(UpdateOne(
            {"user_id": user_id, "type": etype, "slug": slug},
            {
                "$set": _entity_set_fields(e, name, etype, now),
                "$setOnInsert": {"first_seen": now, "created_at": now},
                "$addToSet": {"source_memcell_ids": {"$each": memcell_ids}},
            },
            upsert=True,
        ))
    if ops:
        mongo.memory_entities().bulk_write(ops, ordered=False)


_VALID_REL_TYPES = {"part_of", "led_to", "confused_with", "contradicts", "derived_from", "learned_from"}


def _upsert_relationships(
    user_id: str,
    relationships: list[dict],
    memcell_ids: list[str],
    now: datetime,
) -> None:
    ops: list[UpdateOne] = []
    for r in relationships:
        from_slug = r.get("from_slug", "").strip()
        to_slug = r.get("to_slug", "").strip()
        rtype = r.get("type", "").strip()
        if not from_slug or not to_slug or rtype not in _VALID_REL_TYPES:
            continue

        ops.append(UpdateOne(
            {"user_id": user_id, "from_slug": from_slug, "to_slug": to_slug, "type": rtype},
            {
                "$set": {
                    "from_type": r.get("from_type", "concept"),
                    "to_type": r.get("to_type", "concept"),
                    "weight": r.get("weight", 1.0),
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
                "$addToSet": {"source_memcell_ids": {"$each": memcell_ids}},
            },
            upsert=True,
        ))
    if ops:
        mongo.memory_relationships().bulk_write(ops, ordered=False)
