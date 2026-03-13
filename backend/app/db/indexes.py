from pymongo import ASCENDING

from app.db.mongo import (
    branch_points,
    concept_mastery,
    learning_sessions,
    messages,
    review_schedule,
    threads,
)


def ensure_indexes():
    """Create all indexes from data-model-v2. Safe to call on every startup."""
    # threads
    _ = threads().create_index([("root_thread_id", ASCENDING)])
    _ = threads().create_index([("parent_thread_id", ASCENDING)])
    _ = threads().create_index([("user_id", ASCENDING), ("topic_slug", ASCENDING)])

    # messages
    _ = messages().create_index([("thread_id", ASCENDING), ("created_at", ASCENDING)])
    _ = messages().create_index([("group_id", ASCENDING), ("index", ASCENDING)])

    # branch_points
    _ = branch_points().create_index([("thread_id", ASCENDING)])
    _ = branch_points().create_index([("child_thread_id", ASCENDING)])

    # concept_mastery
    _ = concept_mastery().create_index(
        [("user_id", ASCENDING), ("concept_name", ASCENDING)], unique=True
    )

    # review_schedule
    _ = review_schedule().create_index(
        [("status", ASCENDING), ("scheduled_for", ASCENDING)]
    )

    # learning_sessions
    _ = learning_sessions().create_index([("root_thread_id", ASCENDING)])
    _ = learning_sessions().create_index([("ended_at", ASCENDING)])

    print("\033[34m[SYSTEM]\033[0m: MongoDB indexes ensured.")
