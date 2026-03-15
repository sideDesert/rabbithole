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


@router.get("/knowledge-graph")
def get_knowledge_graph(user_id: str = "user_001", domain: str | None = None):
    """Return the learner's knowledge graph: concept nodes + relationship edges.

    Includes topic hub nodes that group concepts by domain, plus stats.
    """
    query: dict[str, str] = {"user_id": user_id}
    if domain:
        query["domain"] = domain

    concept_docs = list(mongo.get_db()["concept_mastery"].find(query))
    rel_docs = list(mongo.get_db()["concept_relationships"].find({"user_id": user_id}))

    concept_names = {doc.get("concept_name", "") for doc in concept_docs}

    # Build thread lookup once per domain (avoid N+1)
    domain_threads: dict[str, list[str]] = {}
    seen_domains: set[str] = set()
    for doc in concept_docs:
        d = doc.get("domain", "")
        if d and d not in seen_domains:
            seen_domains.add(d)
            thread_docs = mongo.threads().find({"topic_slug": d}, {"_id": 1})
            domain_threads[d] = [str(t["_id"]) for t in thread_docs]

    # Group concepts by domain for hub nodes
    domain_concepts: dict[str, list[dict]] = {}

    # Build concept list (always needed for stats + hub aggregation)
    all_concept_nodes = []
    for doc in concept_docs:
        domain_slug = doc.get("domain", "")
        node = {
            "name": doc.get("concept_name", ""),
            "mastery_score": doc.get("mastery_score", 0.0),
            "strength_trend": doc.get("strength_trend", "stable"),
            "threads": domain_threads.get(domain_slug, []),
            "last_reviewed": str(doc["last_reviewed"]) if doc.get("last_reviewed") else None,
            "domain": domain_slug,
            "source": doc.get("source", "plan"),
            "confidence": doc.get("confidence", 1.0),
            "description": doc.get("description", ""),
            "weak_subconcepts": doc.get("weak_subconcepts", []),
            "node_type": "concept",
        }
        all_concept_nodes.append(node)
        domain_concepts.setdefault(domain_slug, []).append(node)

    # Only include individual concept nodes when a domain filter is active
    nodes = list(all_concept_nodes) if domain else []

    edges = []
    # Only include concept-to-concept edges when drilling into a domain
    if domain:
        for doc in rel_docs:
            from_c = doc.get("from_concept", "")
            to_c = doc.get("to_concept", "")
            if from_c not in concept_names or to_c not in concept_names:
                continue
            edges.append({
                "source": from_c,
                "target": to_c,
                "type": doc.get("type", "prerequisite_of"),
                "weight": 0.3 if doc.get("type") == "prerequisite_of" else doc.get("weight", 1.0),
            })

    # Create topic hub nodes — one per domain
    for d, concepts in domain_concepts.items():
        if not d:
            continue
        avg_mastery = sum(c["mastery_score"] for c in concepts) / len(concepts) if concepts else 0
        hub_name = f"hub:{d}"
        nodes.append({
            "name": hub_name,
            "mastery_score": round(avg_mastery, 2),
            "strength_trend": "stable",
            "threads": domain_threads.get(d, []),
            "last_reviewed": None,
            "domain": d,
            "source": "plan",
            "confidence": 1.0,
            "description": f"{len(concepts)} concepts",
            "weak_subconcepts": [],
            "node_type": "topic_hub",
            "display_name": d.replace("-", " ").title(),
            "concept_count": len(concepts),
        })
        # Connect concepts to their topic hub (only when drilling in)
        if domain:
            for concept in concepts:
                edges.append({
                    "source": hub_name,
                    "target": concept["name"],
                    "type": "part_of",
                    "weight": 0.6,
                })

    # Add thread nodes (filter by domain when drilling in)
    thread_query: dict = {} if user_id == "user_001" else {"user_id": user_id}
    if domain:
        thread_query["topic_slug"] = domain
    thread_docs = list(mongo.threads().find(thread_query))
    for tdoc in thread_docs:
        tid = str(tdoc["_id"])
        t_slug = tdoc.get("topic_slug", "")
        t_hub = f"hub:{t_slug}" if t_slug else None
        nodes.append({
            "name": f"thread:{tid}",
            "mastery_score": 0,
            "strength_trend": "stable",
            "threads": [tid],
            "last_reviewed": None,
            "domain": t_slug,
            "source": "plan",
            "confidence": 1.0,
            "description": tdoc.get("summary", "") or "",
            "weak_subconcepts": [],
            "node_type": "thread",
            "display_name": tdoc.get("title", "Untitled")[:40],
            "concept_count": 0,
            "thread_phase": tdoc.get("phase", ""),
            "thread_status": tdoc.get("status", ""),
            "thread_depth": tdoc.get("depth", 0),
        })
        # Connect thread to its topic hub
        if t_hub and t_slug in domain_concepts:
            edges.append({
                "source": t_hub,
                "target": f"thread:{tid}",
                "type": "explored_from",
                "weight": 0.5,
            })

    domains = sorted(domain_concepts.keys())

    # Central "Rabbithole Memory" node — connects to all topic hubs
    if not domain and len(domain_concepts) > 0:
        overall_avg = (
            sum(d.get("mastery_score", 0) for d in concept_docs) / len(concept_docs)
            if concept_docs else 0
        )
        nodes.append({
            "name": "rabbithole-memory",
            "mastery_score": round(overall_avg, 2),
            "strength_trend": "stable",
            "threads": [],
            "last_reviewed": None,
            "domain": "",
            "source": "plan",
            "confidence": 1.0,
            "description": f"{len(concept_docs)} concepts across {len([d for d in domains if d])} topics",
            "weak_subconcepts": [],
            "node_type": "memory_hub",
            "display_name": "Rabbithole Memory",
            "concept_count": len(concept_docs),
        })
        # Connect memory hub to each topic hub
        for d in domain_concepts:
            if not d:
                continue
            edges.append({
                "source": "rabbithole-memory",
                "target": f"hub:{d}",
                "type": "part_of",
                "weight": 0.8,
            })

    # Stats
    total = len(concept_docs)
    mastered = sum(1 for d in concept_docs if d.get("mastery_score", 0) >= 0.7)
    in_progress = sum(1 for d in concept_docs if 0 < d.get("mastery_score", 0) < 0.7)

    return {
        "nodes": nodes,
        "edges": edges,
        "domains": [d for d in domains if d],
        "stats": {
            "total_concepts": total,
            "mastered": mastered,
            "in_progress": in_progress,
            "undiscovered": total - mastered - in_progress,
            "domain_count": len([d for d in domains if d]),
            "edge_count": len(edges),
        },
    }
