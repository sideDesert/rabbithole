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
