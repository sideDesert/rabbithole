"""Tests for Learning OS agent tools."""

from app.agent.tools import (
    BranchSuggestionTool,
    MemoryRecallTool,
    MemoryStoreTool,
    PlanReadTool,
    PlanToolConfig,
    PlanUpdateTool,
    WebSearchTool,
)
from app.agent.schemas import (
    BranchSuggestionInput,
    MemoryRecallInput,
    MemoryStoreInput,
    PlanReadInput,
    PlanUpdateInput,
    WebSearchInput,
)

SAMPLE_PLAN = """\
# Python Basics

> **Depth:** deep_dive | **Prior knowledge:** none

## Phase 1: Fundamentals

- [ ] Variables — Learn about variable assignment
- [ ] Data Types — Understand ints, floats, strings
- [ ] Control Flow — If statements and loops

## Phase 2: Functions

- [ ] Defining Functions — def keyword and parameters
- [ ] Return Values — Returning data from functions
"""


def test_memory_recall_returns_empty():
    tool = MemoryRecallTool()
    result = tool.run(MemoryRecallInput(query="test query"))
    assert result.memories == []


def test_memory_store_returns_stored():
    tool = MemoryStoreTool()
    result = tool.run(MemoryStoreInput(fact="Python is dynamically typed"))
    assert result.status == "stored"


def test_plan_read_from_filesystem(tmp_path):
    plan_dir = tmp_path / "python-basics"
    plan_dir.mkdir()
    (plan_dir / "plan.md").write_text(SAMPLE_PLAN)

    tool = PlanReadTool(config=PlanToolConfig(plans_dir=tmp_path))
    result = tool.run(PlanReadInput(topic_slug="python-basics"))

    assert "Python Basics" in result.plan_content
    assert result.progress == "0/5 concepts completed"
    assert result.current_concept == "Variables"
    assert result.overall_progress == 0.0


def test_plan_update_toggles_checkbox(tmp_path):
    plan_dir = tmp_path / "python-basics"
    plan_dir.mkdir()
    (plan_dir / "plan.md").write_text(SAMPLE_PLAN)

    tool = PlanUpdateTool(config=PlanToolConfig(plans_dir=tmp_path))
    result = tool.run(PlanUpdateInput(topic_slug="python-basics", concept_name="Variables"))

    assert result.updated is True
    assert result.concept == "Variables"
    assert result.overall_progress > 0.0

    # Verify the file was actually updated
    content = (plan_dir / "plan.md").read_text()
    assert "- [x] Variables" in content
    assert "- [ ] Data Types" in content


def test_plan_update_nonexistent_concept(tmp_path):
    plan_dir = tmp_path / "python-basics"
    plan_dir.mkdir()
    (plan_dir / "plan.md").write_text(SAMPLE_PLAN)

    tool = PlanUpdateTool(config=PlanToolConfig(plans_dir=tmp_path))
    result = tool.run(PlanUpdateInput(topic_slug="python-basics", concept_name="Nonexistent"))

    assert result.updated is False


def test_web_search_returns_empty():
    tool = WebSearchTool()
    result = tool.run(WebSearchInput(query="python tutorials"))
    assert result.results == []


def test_branch_suggestion_returns_empty():
    tool = BranchSuggestionTool()
    result = tool.run(BranchSuggestionInput(current_topic="Python", context="learning basics"))
    assert result.suggestions == []
