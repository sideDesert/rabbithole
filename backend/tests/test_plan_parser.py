"""Tests for the markdown plan parser."""

from app.plan_parser import parse_plan, phase_for_concept

SAMPLE_PLAN = """\
# Operating Systems

> **Depth:** Expert | **Phases:** 3 | **Generated for:** user
> **Prior knowledge:** knows C programming

---

## Phase 1: Fundamentals
- [x] Process Management — how the OS creates and schedules processes
- [ ] Memory Management — virtual memory, paging, and segmentation

## Phase 2: Concurrency
- [ ] Threads — lightweight processes sharing address space
- [ ] Synchronization — mutexes, semaphores, and deadlock prevention

## Phase 3: Storage
- [ ] File Systems — ext4, NTFS, and inode structures
"""


def test_parse_topic_title():
    tree = parse_plan(SAMPLE_PLAN)
    assert tree.topic == "Operating Systems"


def test_parse_metadata_depth():
    tree = parse_plan(SAMPLE_PLAN)
    assert tree.depth == "Expert"


def test_parse_metadata_prior_knowledge():
    tree = parse_plan(SAMPLE_PLAN)
    assert tree.prior_knowledge == "knows C programming"


def test_parse_phases():
    tree = parse_plan(SAMPLE_PLAN)
    assert len(tree.phases) == 3
    assert tree.phases[0].title == "Fundamentals"
    assert tree.phases[1].title == "Concurrency"
    assert tree.phases[2].title == "Storage"
    assert tree.phases[0].order == 1
    assert tree.phases[2].order == 3


def test_parse_concepts():
    tree = parse_plan(SAMPLE_PLAN)
    phase1 = tree.phases[0]
    assert len(phase1.concepts) == 2
    assert phase1.concepts[0].name == "Process Management"
    assert phase1.concepts[0].description == "how the OS creates and schedules processes"
    assert phase1.concepts[0].completed is True
    assert phase1.concepts[0].order == 1
    assert phase1.concepts[1].name == "Memory Management"
    assert phase1.concepts[1].completed is False


def test_phase_progress():
    tree = parse_plan(SAMPLE_PLAN)
    assert tree.phases[0].progress == 0.5  # 1 of 2 completed
    assert tree.phases[1].progress == 0.0  # 0 of 2 completed


def test_overall_progress():
    tree = parse_plan(SAMPLE_PLAN)
    # 1 completed out of 5 total
    assert tree.overall_progress == 1 / 5


def test_first_uncompleted_concept():
    tree = parse_plan(SAMPLE_PLAN)
    first = tree.first_uncompleted_concept()
    assert first is not None
    assert first.name == "Memory Management"


def test_first_uncompleted_when_all_done():
    plan = """\
# Topic

> **Depth:** Beginner | **Phases:** 1 | **Generated for:** user
> **Prior knowledge:** none

---

## Phase 1: Basics
- [x] Done Concept — already finished
"""
    tree = parse_plan(plan)
    assert tree.first_uncompleted_concept() is None


def test_empty_phases_progress():
    plan = """\
# Topic

> **Depth:** Beginner | **Phases:** 0 | **Generated for:** user
> **Prior knowledge:** none
"""
    tree = parse_plan(plan)
    assert tree.overall_progress == 0.0


# --- phase_for_concept tests ---

PHASE_CONCEPT_PLAN = """\
# Test Topic

> **Depth:** beginner | **Prior knowledge:** none

## Phase 1: Basics
- [x] Concept A — first concept
- [ ] Concept B — second concept

## Phase 2: Advanced
- [ ] Concept C — third concept
- [ ] Concept D — fourth concept
"""


def test_phase_for_concept_found():
    tree = parse_plan(PHASE_CONCEPT_PLAN)
    phase, concept, is_last = phase_for_concept(tree, "Concept B")
    assert phase.title == "Basics"
    assert concept.name == "Concept B"
    assert is_last is True  # last uncompleted in phase 1


def test_phase_for_concept_not_last():
    tree = parse_plan(PHASE_CONCEPT_PLAN)
    phase, concept, is_last = phase_for_concept(tree, "Concept C")
    assert phase.title == "Advanced"
    assert is_last is False  # Concept D still uncompleted


def test_phase_for_concept_not_found():
    tree = parse_plan(PHASE_CONCEPT_PLAN)
    result = phase_for_concept(tree, "Nonexistent")
    assert result is None
