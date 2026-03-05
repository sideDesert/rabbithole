"""Tests for phase transition logic."""

from unittest.mock import MagicMock

from app.agent.phases import apply_transition, should_transition


def test_interview_create_plan_transitions_to_planning():
    assert should_transition(current_phase="interview", tool_called="create_plan") == "planning"


def test_interview_other_tool_no_transition():
    assert should_transition(current_phase="interview", tool_called="recall_about_user") is None


def test_planning_user_approved_transitions_to_teaching():
    assert should_transition(current_phase="planning", user_approved_plan=True) == "teaching"


def test_teaching_any_tool_no_transition():
    assert should_transition(current_phase="teaching", tool_called="create_plan") is None


def test_apply_transition_calls_update_one():
    collection = MagicMock()
    apply_transition(db_threads=collection, thread_id="t1", new_phase="planning")

    collection.update_one.assert_called_once()
    args = collection.update_one.call_args
    assert args[0][0] == {"_id": "t1"}
    assert args[0][1]["$set"]["phase"] == "planning"
    assert "updated_at" in args[0][1]["$set"]


def test_apply_transition_with_interview_context():
    collection = MagicMock()
    ctx = {"goals": ["learn python"]}
    apply_transition(db_threads=collection, thread_id="t1", new_phase="planning", interview_context=ctx)

    update_doc = collection.update_one.call_args[0][1]
    assert update_doc["$set"]["interview_context"] == ctx
