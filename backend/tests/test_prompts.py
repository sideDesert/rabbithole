"""Tests for phase-aware system prompts."""

from app.agent.prompts import (
    INTERVIEW_PROMPT,
    PLAN_GENERATION_PROMPT,
    TEACHING_PROMPT,
    build_phase_prompt,
)


# ---- Prompt content checks ----

def test_interview_prompt_mentions_memory():
    assert "memory" in INTERVIEW_PROMPT.lower()


def test_interview_prompt_mentions_assess():
    assert "assess" in INTERVIEW_PROMPT.lower()


def test_planning_prompt_mentions_curriculum():
    assert "curriculum" in PLAN_GENERATION_PROMPT.lower()


def test_planning_prompt_mentions_expert():
    assert "expert" in PLAN_GENERATION_PROMPT.lower()


def test_teaching_prompt_mentions_feynman():
    assert "feynman" in TEACHING_PROMPT.lower()


def test_teaching_prompt_mentions_intuition():
    assert "intuition" in TEACHING_PROMPT.lower()


# ---- build_phase_prompt ----

def test_build_phase_prompt_returns_base_for_interview():
    result = build_phase_prompt(phase="interview")
    assert "Memory" in result
    assert "Interview" in result


def test_build_phase_prompt_returns_base_for_planning():
    result = build_phase_prompt(phase="planning")
    assert "curriculum" in result.lower()


def test_build_phase_prompt_returns_base_for_teaching():
    result = build_phase_prompt(phase="teaching")
    assert "Feynman" in result


def test_plan_context_included_when_provided():
    result = build_phase_prompt(phase="teaching", plan_context="## Phase 1\n- [ ] Basics")
    assert "## Current Plan" in result
    assert "Phase 1" in result


def test_memory_context_included_when_provided():
    result = build_phase_prompt(phase="teaching", memory_context="Learner prefers visual examples")
    assert "## Learner Memories" in result
    assert "visual examples" in result


def test_current_concept_included_when_provided():
    result = build_phase_prompt(phase="teaching", current_concept="Hash Tables")
    assert "## Current Concept" in result
    assert "Hash Tables" in result


def test_interview_context_included_when_provided():
    result = build_phase_prompt(phase="interview", interview_context="Has 2 years experience")
    assert "## Interview So Far" in result
    assert "2 years experience" in result


def test_unknown_phase_raises():
    import pytest
    with pytest.raises(ValueError, match="Unknown phase"):
        build_phase_prompt(phase="unknown")


def test_no_optional_sections_when_none():
    result = build_phase_prompt(phase="interview")
    assert "## Current Plan" not in result
    assert "## Learner Memories" not in result
    assert "## Current Concept" not in result
    assert "## Interview So Far" not in result
