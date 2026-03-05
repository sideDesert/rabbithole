"""OpenAI-format tool definitions and executor.

Maps phase → available tools (as OpenAI function-calling format).
Executes tool calls by dispatching to the appropriate BaseTool class.
"""

from app.config import PLANS_DIR
from app.agent.tools import (
    MemoryRecallTool, MemoryStoreTool, InterviewTool,
    PlanCreateTool, PlanReadTool, PlanUpdateTool, PlanToolConfig,
    WebSearchTool, BranchSuggestionTool,
)
from app.agent.schemas import (
    MemoryRecallInput, MemoryStoreInput, InterviewInput,
    PlanCreateInput, PlanReadInput, PlanUpdateInput,
    WebSearchInput, BranchSuggestionInput,
)

# ── OpenAI tool definitions per phase ─────────────────────────────────────

_RECALL = {
    "type": "function",
    "function": {
        "name": "recall_memory",
        "description": "Search memories about the learner. Use before asking questions to avoid re-asking things you already know.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for"},
            },
            "required": ["query"],
        },
    },
}

_REMEMBER = {
    "type": "function",
    "function": {
        "name": "store_memory",
        "description": "Store an important observation about the learner.",
        "parameters": {
            "type": "object",
            "properties": {
                "fact": {"type": "string", "description": "The observation to remember"},
            },
            "required": ["fact"],
        },
    },
}

_INTERVIEW = {
    "type": "function",
    "function": {
        "name": "interview",
        "description": "Generate structured interview questions to assess the learner.",
        "parameters": {
            "type": "object",
            "properties": {
                "purpose": {"type": "string", "description": "Why you need to ask, e.g. 'assess Rust experience'"},
                "num_questions": {"type": "integer", "description": "Number of questions (1-5)", "default": 3},
                "question_type": {"type": "string", "enum": ["multiple_choice", "open_ended", "scale"], "default": "multiple_choice"},
            },
            "required": ["purpose"],
        },
    },
}

_CREATE_PLAN = {
    "type": "function",
    "function": {
        "name": "create_plan",
        "description": "Generate an expert-depth learning plan. Call this when you have enough context from the interview.",
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "The topic to learn"},
                "user_context": {"type": "string", "description": "Everything you know about the learner (from interview + memory)"},
                "depth": {"type": "string", "enum": ["overview", "intermediate", "deep_dive", "expert"], "default": "deep_dive"},
            },
            "required": ["topic", "user_context"],
        },
    },
}

_READ_PLAN = {
    "type": "function",
    "function": {
        "name": "read_plan",
        "description": "Read the current learning plan to see progress and find the next concept to teach.",
        "parameters": {
            "type": "object",
            "properties": {
                "topic_slug": {"type": "string", "description": "Topic slug, e.g. 'async-rust'"},
            },
            "required": ["topic_slug"],
        },
    },
}

_UPDATE_PLAN = {
    "type": "function",
    "function": {
        "name": "update_plan_progress",
        "description": "Mark a concept as completed in the learning plan.",
        "parameters": {
            "type": "object",
            "properties": {
                "topic_slug": {"type": "string", "description": "Topic slug"},
                "concept_name": {"type": "string", "description": "Exact concept name to mark complete"},
            },
            "required": ["topic_slug", "concept_name"],
        },
    },
}

_WEB_SEARCH = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for curriculum resources, explanations, or references.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "num_results": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    },
}

_BRANCH_SUGGEST = {
    "type": "function",
    "function": {
        "name": "suggest_branches",
        "description": "Suggest related sub-topics the learner might want to explore.",
        "parameters": {
            "type": "object",
            "properties": {
                "current_topic": {"type": "string", "description": "Current topic being discussed"},
                "context": {"type": "string", "description": "What prompted the suggestion"},
            },
            "required": ["current_topic", "context"],
        },
    },
}


PHASE_TOOLS = {
    "interview": [_RECALL, _REMEMBER, _INTERVIEW, _CREATE_PLAN],
    "planning": [_RECALL, _REMEMBER, _WEB_SEARCH, _CREATE_PLAN],
    "teaching": [_RECALL, _REMEMBER, _WEB_SEARCH, _BRANCH_SUGGEST, _READ_PLAN, _UPDATE_PLAN, _INTERVIEW],
}


# ── Tool executor ─────────────────────────────────────────────────────────

_plan_config = PlanToolConfig(plans_dir=PLANS_DIR)


def execute_tool(name: str, args: dict, topic_slug: str = "") -> dict:
    """Execute a tool by name, return the result as a dict."""

    if name == "recall_memory":
        tool = MemoryRecallTool()
        result = tool.run(MemoryRecallInput(**args))

    elif name == "store_memory":
        tool = MemoryStoreTool()
        result = tool.run(MemoryStoreInput(**args))

    elif name == "interview":
        tool = InterviewTool()
        result = tool.run(InterviewInput(**args))

    elif name == "create_plan":
        tool = PlanCreateTool()
        result = tool.run(PlanCreateInput(**args))

    elif name == "read_plan":
        # If no topic_slug in args, use the one from the thread
        if "topic_slug" not in args and topic_slug:
            args["topic_slug"] = topic_slug
        tool = PlanReadTool(config=_plan_config)
        result = tool.run(PlanReadInput(**args))

    elif name == "update_plan_progress":
        if "topic_slug" not in args and topic_slug:
            args["topic_slug"] = topic_slug
        tool = PlanUpdateTool(config=_plan_config)
        result = tool.run(PlanUpdateInput(**args))

    elif name == "web_search":
        tool = WebSearchTool()
        result = tool.run(WebSearchInput(**args))

    elif name == "suggest_branches":
        tool = BranchSuggestionTool()
        result = tool.run(BranchSuggestionInput(**args))

    else:
        return {"error": f"Unknown tool: {name}"}

    return result.model_dump()
