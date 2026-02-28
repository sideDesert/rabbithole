from pymongo import ASCENDING

from app.db.mongo import (
    threads,
    messages,
    branch_points,
    concept_mastery,
    review_schedule,
    learning_sessions,
)


def ensure_indexes():
    """Create all indexes from data-model-v2. Safe to call on every startup."""
    # threads
    threads().create_index([("root_thread_id", ASCENDING)])
    threads().create_index([("parent_thread_id", ASCENDING)])
    threads().create_index([("user_id", ASCENDING), ("topic_slug", ASCENDING)])

    # messages
    messages().create_index([("thread_id", ASCENDING), ("created_at", ASCENDING)])
    messages().create_index([("group_id", ASCENDING), ("index", ASCENDING)])

    # branch_points
    branch_points().create_index([("thread_id", ASCENDING)])
    branch_points().create_index([("child_thread_id", ASCENDING)])

    # concept_mastery
    concept_mastery().create_index(
        [("user_id", ASCENDING), ("concept_name", ASCENDING)], unique=True
    )

    # review_schedule
    review_schedule().create_index(
        [("status", ASCENDING), ("scheduled_for", ASCENDING)]
    )

    # learning_sessions
    learning_sessions().create_index([("root_thread_id", ASCENDING)])
    learning_sessions().create_index([("ended_at", ASCENDING)])

    print("\033[34m[SYSTEM]\033[0m: MongoDB indexes ensured.")
