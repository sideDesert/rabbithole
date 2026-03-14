"""Tests for thread title generation helpers."""

from app.api.chat import clean_title


def test_clean_title_strips_quotes():
    assert clean_title('"Quantum Mechanics Basics"') == "Quantum Mechanics Basics"


def test_clean_title_strips_single_quotes():
    assert clean_title("'Quantum Mechanics Basics'") == "Quantum Mechanics Basics"


def test_clean_title_strips_trailing_period():
    assert clean_title("Quantum Mechanics Basics.") == "Quantum Mechanics Basics"


def test_clean_title_caps_at_80_chars():
    long = "A" * 100
    assert len(clean_title(long)) == 80


def test_clean_title_strips_and_caps():
    long = '"' + "A" * 100 + '".'
    result = clean_title(long)
    assert len(result) == 80
    assert not result.startswith('"')


def test_clean_title_preserves_normal_title():
    assert clean_title("Learning Python Basics") == "Learning Python Basics"


def test_clean_title_handles_empty():
    assert clean_title("") == ""
