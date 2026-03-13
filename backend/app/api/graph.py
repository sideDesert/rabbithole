"""Graph visualization endpoints."""

import json as _json

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

    concepts_map: dict[str, dict] = {}
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
                for tid in thread_ids:
                    if tid not in concepts_map[name]["threads"]:
                        concepts_map[name]["threads"].append(tid)

                if prev_name and prev_name != name:
                    edge = {"source": prev_name, "target": name}
                    if edge not in prerequisites:
                        prerequisites.append(edge)
                prev_name = name

    # Overlay mastery data from ConceptMastery collection
    mastery_docs = list(mongo.get_db()["concept_mastery"].find({"user_id": "user_001"}))
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
