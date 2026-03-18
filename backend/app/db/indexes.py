from pymongo import ASCENDING

from app.db.mongo import (
    branch_points,
    concept_mastery,
    feynman_notes,
    learning_sessions,
    memory_entities,
    memory_relationships,
    messages,
    review_schedule,
    test_results,
    threads,
)


def ensure_indexes():
    """Create all indexes from data-model-v2. Safe to call on every startup."""
    # threads
    _ = threads().create_index([("root_thread_id", ASCENDING)])
    _ = threads().create_index([("parent_thread_id", ASCENDING)])
    _ = threads().create_index([("user_id", ASCENDING), ("topic_slug", ASCENDING)])
    _ = threads().create_index([("user_id", ASCENDING), ("agent", ASCENDING)])

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
    _ = review_schedule().create_index(
        [("user_id", ASCENDING), ("status", ASCENDING), ("scheduled_for", ASCENDING)]
    )

    # test_results
    _ = test_results().create_index(
        [("user_id", ASCENDING), ("created_at", ASCENDING)]
    )

    # learning_sessions
    _ = learning_sessions().create_index([("root_thread_id", ASCENDING)])
    _ = learning_sessions().create_index([("ended_at", ASCENDING)])

    # memory_entities
    _ = memory_entities().create_index(
        [("user_id", ASCENDING), ("type", ASCENDING), ("slug", ASCENDING)],
        unique=True,
    )
    _ = memory_entities().create_index(
        [("user_id", ASCENDING), ("domain", ASCENDING)]
    )

    # memory_relationships
    _ = memory_relationships().create_index(
        [("user_id", ASCENDING), ("from_slug", ASCENDING), ("to_slug", ASCENDING), ("type", ASCENDING)],
        unique=True,
    )
    _ = memory_relationships().create_index(
        [("user_id", ASCENDING), ("type", ASCENDING)]
    )

    # feynman_notes
    _ = feynman_notes().create_index(
        [("user_id", ASCENDING), ("topic_slug", ASCENDING), ("concept_name", ASCENDING), ("version", ASCENDING)]
    )

    print("\033[34m[SYSTEM]\033[0m: MongoDB indexes ensured.")
