"""Tests for parse_interview_question."""

from app.api.chat import parse_interview_question


VALID_CONTENT = """\
Here's a question to understand your background:

## Questions
What is your experience with operating systems?

## Options
1. No experience at all
2. I've used Linux casually
3. I've taken a college course
4. I work with OS internals professionally
"""

MULTI_LINE_QUESTION = """\
## Questions
How would you describe your understanding
of virtual memory and paging?

## Options
1. Never heard of it
2. Vaguely familiar
3. Solid understanding
"""

NO_QUESTION_SECTION = """\
Here is some content without the expected format.

Just a regular paragraph with no markdown structure.
"""

NO_OPTIONS = """\
## Questions
What do you know about file systems?

## Options
"""

EXTRA_TEXT_AROUND = """\
Some preamble text here.

## Questions
Rate your concurrency knowledge

## Options
1. Beginner
2. Intermediate
3. Advanced

Some trailing text here.
"""


def test_parses_question_text():
    result = parse_interview_question(VALID_CONTENT)
    assert result["parsed"] is True
    assert result["question"] == "What is your experience with operating systems?"


def test_parses_all_options():
    result = parse_interview_question(VALID_CONTENT)
    assert result["options"] == [
        "No experience at all",
        "I've used Linux casually",
        "I've taken a college course",
        "I work with OS internals professionally",
    ]


def test_multi_line_question():
    result = parse_interview_question(MULTI_LINE_QUESTION)
    assert result["parsed"] is True
    assert "virtual memory and paging" in result["question"]


def test_no_question_section_returns_unparsed():
    result = parse_interview_question(NO_QUESTION_SECTION)
    assert result["parsed"] is False
    assert result["content"] == NO_QUESTION_SECTION


def test_no_options_returns_empty_list():
    result = parse_interview_question(NO_OPTIONS)
    assert result["parsed"] is True
    assert result["options"] == []


def test_extra_text_around_sections():
    result = parse_interview_question(EXTRA_TEXT_AROUND)
    assert result["parsed"] is True
    assert result["question"] == "Rate your concurrency knowledge"
    assert result["options"] == ["Beginner", "Intermediate", "Advanced"]


NUMBERED_QUESTION = """\
## Questions
1. Which of these describes you best?

## Options
1. Beginner
2. Intermediate
3. Advanced
"""


def test_numbered_question_not_captured_as_option():
    """Numbered items in the question text should not leak into options."""
    result = parse_interview_question(NUMBERED_QUESTION)
    assert result["parsed"] is True
    assert result["question"] == "1. Which of these describes you best?"
    assert result["options"] == ["Beginner", "Intermediate", "Advanced"]
