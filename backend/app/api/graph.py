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
