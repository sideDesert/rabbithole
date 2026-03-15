"""Shared helpers for walking thread trees."""

from app.db import mongo
from app.models.thread import Thread


def load_thread_tree(
    thread_id: str,
) -> tuple[str, dict[str, Thread], dict[str, list[str]]]:
    """Load all threads in a tree and return (root_id, thread_map, children_by_parent)."""
    raw = mongo.threads().find_one({"_id": thread_id})
    if not raw:
        return "", {}, {}

    root_id = str(raw.get("root_thread_id", thread_id))
    sibling_raws = list(mongo.threads().find({"root_thread_id": root_id}))
    if not any(st["_id"] == root_id for st in sibling_raws):
        root_doc = mongo.threads().find_one({"_id": root_id})
        if root_doc:
            sibling_raws.append(root_doc)

    by_parent: dict[str, list[str]] = {}
    thread_map: dict[str, Thread] = {}
    for raw_doc in sibling_raws:
        t = Thread.model_validate(raw_doc)
        tid = t.id
        thread_map[tid] = t
        if t.parent_thread_id:
            by_parent.setdefault(t.parent_thread_id, []).append(tid)

    return root_id, thread_map, by_parent
