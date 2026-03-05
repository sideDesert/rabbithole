"""Tests for PlanCreateTool."""

from unittest.mock import MagicMock

from app.agent.schemas import PlanCreateInput
from app.agent.tools import PlanCreateTool, _slugify


MOCK_PLAN_MD = """\
# Rust Programming

> **Depth:** deep_dive | **Prior knowledge:** knows Python

## Phase 1: Foundations

- [ ] Ownership Model — understand Rust's ownership system
- [ ] Borrowing — references and borrowing rules
- [ ] Lifetimes — annotating and understanding lifetimes

## Phase 2: Type System

- [ ] Structs — defining and using structs
- [ ] Enums — algebraic data types and pattern matching
"""


def _make_mock_client(content: str) -> MagicMock:
    """Create a mock OpenAI client that returns the given content."""
    client = MagicMock()
    message = MagicMock()
    message.content = content
    choice = MagicMock()
    choice.message = message
    response = MagicMock()
    response.choices = [choice]
    client.chat.completions.create.return_value = response
    return client


def test_plan_create_writes_file(tmp_path):
    client = _make_mock_client(MOCK_PLAN_MD)
    tool = PlanCreateTool(plans_dir=tmp_path, llm_client=client)

    result = tool.run(
        PlanCreateInput(
            topic="Rust Programming",
            user_context="knows Python",
            depth="deep_dive",
        )
    )

    plan_path = tmp_path / "rust-programming" / "plan.md"
    assert plan_path.exists()
    assert plan_path.read_text() == MOCK_PLAN_MD
    assert result.plan_path == str(plan_path)
    assert result.plan_content == MOCK_PLAN_MD


def test_plan_create_creates_notes_dir(tmp_path):
    client = _make_mock_client(MOCK_PLAN_MD)
    tool = PlanCreateTool(plans_dir=tmp_path, llm_client=client)

    tool.run(
        PlanCreateInput(
            topic="Rust Programming",
            user_context="knows Python",
            depth="deep_dive",
        )
    )

    notes_dir = tmp_path / "rust-programming" / "notes"
    assert notes_dir.is_dir()


def test_plan_create_returns_correct_counts(tmp_path):
    client = _make_mock_client(MOCK_PLAN_MD)
    tool = PlanCreateTool(plans_dir=tmp_path, llm_client=client)

    result = tool.run(
        PlanCreateInput(
            topic="Rust Programming",
            user_context="knows Python",
            depth="deep_dive",
        )
    )

    assert result.concept_count == 5
    assert result.phase_count == 2


def test_plan_create_calls_llm(tmp_path):
    client = _make_mock_client(MOCK_PLAN_MD)
    tool = PlanCreateTool(plans_dir=tmp_path, llm_client=client)

    tool.run(
        PlanCreateInput(
            topic="Rust Programming",
            user_context="knows Python",
            depth="deep_dive",
        )
    )

    client.chat.completions.create.assert_called_once()
    call_kwargs = client.chat.completions.create.call_args
    messages = call_kwargs.kwargs.get("messages") or call_kwargs[1].get("messages")
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert "Rust Programming" in messages[1]["content"]


def test_slugify_basic():
    assert _slugify("Rust Programming") == "rust-programming"


def test_slugify_special_chars():
    assert _slugify("C++ for Beginners!") == "c-for-beginners"


def test_slugify_extra_hyphens():
    assert _slugify("  Hello   World  ") == "hello-world"


def test_slugify_numbers():
    assert _slugify("Python 3.12 Guide") == "python-3-12-guide"
