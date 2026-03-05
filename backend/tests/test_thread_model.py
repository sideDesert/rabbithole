"""Tests for Thread model phase-related fields."""

from app.models.thread import Thread


def _make_thread(**overrides) -> Thread:
    defaults = {
        "user_id": "u1",
        "title": "Test Thread",
        "topic_slug": "test-topic",
        "evermemos_group_id": "grp1",
    }
    defaults.update(overrides)
    return Thread(**defaults)


def test_phase_defaults_to_interview():
    thread = _make_thread()
    assert thread.phase == "interview"


def test_phase_accepts_planning():
    thread = _make_thread(phase="planning")
    assert thread.phase == "planning"


def test_phase_accepts_teaching():
    thread = _make_thread(phase="teaching")
    assert thread.phase == "teaching"


def test_interview_context_defaults_to_empty_dict():
    thread = _make_thread()
    assert thread.interview_context == {}


def test_current_concept_defaults_to_none():
    thread = _make_thread()
    assert thread.current_concept is None
