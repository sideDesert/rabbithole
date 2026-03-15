"""Memory graph API endpoints."""

from fastapi import APIRouter

from app.db import mongo
from app.services.memory_graph_extractor import extract_memory_graph

router = APIRouter(prefix="/api", tags=["memory-graph"])


@router.get("/memory-graph")
def get_memory_graph(
    user_id: str = "user_001",
    entity_type: str | None = None,
    domain: str | None = None,
):
    """Return the user's memory graph: entity nodes + relationship edges."""
    query: dict = {"user_id": user_id}
    if entity_type:
        query["type"] = entity_type
    if domain:
        query["domain"] = domain

    entity_docs = list(mongo.memory_entities().find(query))
    rel_docs = list(mongo.memory_relationships().find({"user_id": user_id}))

    entity_slugs = {doc.get("slug", "") for doc in entity_docs}

    nodes = []
    for doc in entity_docs:
        nodes.append({
            "slug": doc.get("slug", ""),
            "type": doc.get("type", "concept"),
            "name": doc.get("name", ""),
            "domain": doc.get("domain", ""),
            "mastery": doc.get("mastery", 0.0),
            "confidence": doc.get("confidence", 1.0),
            "role": doc.get("role", ""),
            "statement": doc.get("statement", ""),
            "about_concept_slug": doc.get("about_concept_slug", ""),
            "verified": doc.get("verified"),
            "correct": doc.get("correct"),
            "superseded_by": doc.get("superseded_by", ""),
            "title": doc.get("title", ""),
            "url": doc.get("url", ""),
            "resource_type": doc.get("resource_type", ""),
            "first_seen": str(doc["first_seen"]) if doc.get("first_seen") else None,
            "last_seen": str(doc["last_seen"]) if doc.get("last_seen") else None,
            "source_memcell_ids": doc.get("source_memcell_ids", []),
        })

    edges = []
    for doc in rel_docs:
        from_s = doc.get("from_slug", "")
        to_s = doc.get("to_slug", "")
        if from_s not in entity_slugs or to_s not in entity_slugs:
            continue
        edges.append({
            "source": from_s,
            "target": to_s,
            "type": doc.get("type", "part_of"),
            "weight": doc.get("weight", 1.0),
            "from_type": doc.get("from_type", "concept"),
            "to_type": doc.get("to_type", "concept"),
        })

    # Synthesize implicit edges: facts/beliefs → their about_concept_slug
    edge_keys = {(e["source"], e["target"], e["type"]) for e in edges}
    for n in nodes:
        if n["type"] in ("fact", "belief") and n["about_concept_slug"]:
            parent = n["about_concept_slug"]
            if parent in entity_slugs and (n["slug"], parent, "part_of") not in edge_keys:
                edges.append({
                    "source": n["slug"],
                    "target": parent,
                    "type": "part_of",
                    "weight": 0.8,
                    "from_type": n["type"],
                    "to_type": "concept",
                })
                edge_keys.add((n["slug"], parent, "part_of"))

    entity_types = sorted({n["type"] for n in nodes})
    domains = sorted({n["domain"] for n in nodes if n["domain"]})

    type_counts = {}
    for n in nodes:
        type_counts[n["type"]] = type_counts.get(n["type"], 0) + 1

    return {
        "nodes": nodes,
        "edges": edges,
        "entity_types": entity_types,
        "domains": domains,
        "stats": {
            "concept_count": type_counts.get("concept", 0),
            "person_count": type_counts.get("person", 0),
            "fact_count": type_counts.get("fact", 0),
            "belief_count": type_counts.get("belief", 0),
            "resource_count": type_counts.get("resource", 0),
            "relationship_count": len(edges),
        },
    }


@router.post("/memory-graph/sync")
async def sync_memory_graph(user_id: str = "user_001"):
    """Manually trigger memory graph extraction from EverMemOS MemCells."""
    await extract_memory_graph(user_id)
    return {"status": "ok"}
