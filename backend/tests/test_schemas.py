"""Basic instantiation tests for agent tool I/O schemas."""

from app.agent.schemas import (
    BranchSuggestion,
    BranchSuggestionInput,
    BranchSuggestionOutput,
    InterviewInput,
    InterviewOutput,
    InterviewQuestion,
    MemoryRecallInput,
    MemoryRecallOutput,
    MemoryStoreInput,
    MemoryStoreOutput,
    PlanCreateInput,
    PlanCreateOutput,
    PlanReadInput,
    PlanReadOutput,
    PlanUpdateInput,
    PlanUpdateOutput,
    SearchResult,
    WebSearchInput,
    WebSearchOutput,
)


# ── Memory Tool ──────────────────────────────────────────────────────────────


def test_memory_recall_input():
    schema = MemoryRecallInput(query="What is recursion?")
    assert schema.query == "What is recursion?"
    assert schema.memory_type is None


def test_memory_recall_input_with_type():
    schema = MemoryRecallInput(query="recursion", memory_type="episode")
    assert schema.memory_type == "episode"


def test_memory_recall_output_default():
    schema = MemoryRecallOutput()
    assert schema.memories == []


def test_memory_recall_output_with_data():
    schema = MemoryRecallOutput(memories=[{"id": "1", "content": "test"}])
    assert len(schema.memories) == 1


def test_memory_store_input():
    schema = MemoryStoreInput(fact="User knows Python basics")
    assert schema.fact == "User knows Python basics"


def test_memory_store_output_default():
    schema = MemoryStoreOutput()
    assert schema.status == "stored"


# ── Interview Tool ───────────────────────────────────────────────────────────


def test_interview_question():
    q = InterviewQuestion(text="What is a variable?")
    assert q.text == "What is a variable?"
    assert q.options is None
    assert q.context == ""


def test_interview_question_with_options():
    q = InterviewQuestion(text="Pick one", options=["A", "B", "C"], context="basics")
    assert len(q.options) == 3
    assert q.context == "basics"


def test_interview_input_defaults():
    schema = InterviewInput(purpose="assess knowledge")
    assert schema.num_questions == 3
    assert schema.question_type == "multiple_choice"


def test_interview_output():
    q = InterviewQuestion(text="Q1")
    schema = InterviewOutput(questions=[q])
    assert len(schema.questions) == 1


# ── Plan Tool ────────────────────────────────────────────────────────────────


def test_plan_create_input():
    schema = PlanCreateInput(topic="Python", user_context="beginner")
    assert schema.topic == "Python"
    assert schema.depth == "deep_dive"


def test_plan_create_output():
    schema = PlanCreateOutput(plan_content="# Plan", plan_path="/tmp/plan.md", concept_count=5, phase_count=3)
    assert schema.concept_count == 5


def test_plan_read_input():
    schema = PlanReadInput(topic_slug="python-basics")
    assert schema.topic_slug == "python-basics"


def test_plan_read_output():
    schema = PlanReadOutput(plan_content="# Plan", progress="2/5", overall_progress=0.4)
    assert schema.current_concept is None
    assert schema.overall_progress == 0.4


def test_plan_update_input():
    schema = PlanUpdateInput(topic_slug="python-basics", concept_name="variables")
    assert schema.concept_name == "variables"


def test_plan_update_output():
    schema = PlanUpdateOutput(updated=True, concept="variables", phase_progress=0.5, overall_progress=0.2)
    assert schema.updated is True


# ── Web Search Tool ─────────────────────────────────────────────────────────


def test_search_result():
    r = SearchResult(title="Test", url="https://example.com", snippet="A snippet")
    assert r.url == "https://example.com"


def test_web_search_input_defaults():
    schema = WebSearchInput(query="python tutorial")
    assert schema.num_results == 5
    assert schema.search_type == "explanation"


def test_web_search_output_default():
    schema = WebSearchOutput()
    assert schema.results == []


def test_web_search_output_with_results():
    r = SearchResult(title="T", url="https://x.com", snippet="S")
    schema = WebSearchOutput(results=[r])
    assert len(schema.results) == 1


# ── Branch Suggestion Tool ───────────────────────────────────────────────────


def test_branch_suggestion():
    s = BranchSuggestion(topic="Decorators", reason="Related to functions", depth_estimate="moderate")
    assert s.topic == "Decorators"


def test_branch_suggestion_input():
    schema = BranchSuggestionInput(current_topic="Functions", context="Learning Python basics")
    assert schema.current_topic == "Functions"


def test_branch_suggestion_output():
    s = BranchSuggestion(topic="Closures", reason="Prerequisite", depth_estimate="quick_look")
    schema = BranchSuggestionOutput(suggestions=[s])
    assert len(schema.suggestions) == 1
