"""Agent factory: builds phase-specific Agents for the OpenAI Agents SDK.

Each phase (interview, planning, teaching) gets a different Agent with
different tools and instructions. Provider is selected via LLM_PROVIDER
env var (nvidia / openrouter).
"""

from agents import Agent, OpenAIChatCompletionsModel, set_default_openai_api, set_tracing_disabled
from openai import AsyncOpenAI

from app.config import DEFAULT_MODEL, LLM_API_KEY, LLM_BASE_URL
from app.agent.prompts import build_phase_prompt
from app.tools_impl import (
    AgentContext,
    create_plan,
    present_interview,
    read_plan,
    recall_memory,
    store_memory,
    suggest_branches,
    update_plan_progress,
)

set_default_openai_api("chat_completions")
set_tracing_disabled(True)

_llm_client = AsyncOpenAI(
    base_url=LLM_BASE_URL,
    api_key=LLM_API_KEY,
)

_model = OpenAIChatCompletionsModel(
    model=DEFAULT_MODEL,
    openai_client=_llm_client,
)

PHASE_TOOLS = {
    "interview": [recall_memory, store_memory, present_interview, create_plan],
    "planning": [recall_memory, store_memory, create_plan],
    "teaching": [
        recall_memory,
        store_memory,
        suggest_branches,
        read_plan,
        update_plan_progress,
    ],
}


def build_agent(
    *,
    phase: str,
    plan_context: str | None = None,
    current_concept: str | None = None,
    memory_context: str | None = None,
    interview_context: str | None = None,
    parent_summary: str | None = None,
    branch_text: str | None = None,
) -> Agent[AgentContext]:
    """Create an Agent configured for the given phase with appropriate tools and prompt."""
    instructions = build_phase_prompt(
        phase=phase,
        plan_context=plan_context,
        current_concept=current_concept,
        memory_context=memory_context,
        interview_context=interview_context,
        parent_summary=parent_summary,
        branch_text=branch_text,
    )

    tools = PHASE_TOOLS.get(phase, [])

    return Agent(
        name="Feynman",
        instructions=instructions,
        model=_model,
        tools=tools,
    )
