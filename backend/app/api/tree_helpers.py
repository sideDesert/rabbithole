"""Shared helpers for walking thread trees."""

from app.db import mongo


def load_thread_tree(thread_id: str) -> tuple[str, dict[str, dict], dict[str, list[str]]]:
    """Load all threads in a tree and return (root_id, thread_map, children_by_parent)."""
    thread = mongo.threads().find_one({"_id": thread_id})
    if not thread:
        return "", {}, {}

    root_id = str(thread.get("root_thread_id", thread_id))
    all_threads = list(mongo.threads().find({"root_thread_id": root_id}))
    if not any(t["_id"] == root_id for t in all_threads):
        root_doc = mongo.threads().find_one({"_id": root_id})
        if root_doc:
            all_threads.append(root_doc)

    by_parent: dict[str, list[str]] = {}
    thread_map: dict[str, dict] = {}
    for t in all_threads:
        tid = str(t["_id"])
        thread_map[tid] = t
        pid = t.get("parent_thread_id")
        if pid:
            by_parent.setdefault(str(pid), []).append(tid)

    return root_id, thread_map, by_parent
