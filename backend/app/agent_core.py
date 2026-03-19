"""Agent factory: builds phase-specific Agents for the OpenAI Agents SDK.

Each phase (interview, planning, teaching) gets a different Agent with
different tools and instructions. Provider is selected via LLM_PROVIDER
env var (nvidia / openrouter).
"""

from agents import Agent, OpenAIChatCompletionsModel, set_default_openai_api, set_tracing_disabled


from app.config import get_config, get_llm
from app.agent.prompts import EBBINGHAUS_SYSTEM_PROMPT, build_phase_prompt
from app.tools_impl import (
    AgentContext,
    create_plan,
    get_parked_topics,
    offer_branch,
    park_topic,
    present_interview,
    read_plan,
    recall_memory,
    recall_memory_agentic,
    store_memory,
    suggest_branches,
    trigger_feynman,
    update_plan_progress,
)

set_default_openai_api("chat_completions")
set_tracing_disabled(True)

def _get_model() -> OpenAIChatCompletionsModel:
    return OpenAIChatCompletionsModel(
        model=get_config().default_model,
        openai_client=get_llm(),
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
        trigger_feynman,
        park_topic,
        get_parked_topics,
        offer_branch,
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
        model=_get_model(),
        tools=tools,
    )


# ---------------------------------------------------------------------------
# Ebbinghaus agent — memory-powered chat (singleton)
# ---------------------------------------------------------------------------

def build_ebbinghaus_agent() -> Agent[AgentContext]:
    """Return an Ebbinghaus agent with current config."""
    return Agent(
        name="Ebbinghaus",
        instructions=EBBINGHAUS_SYSTEM_PROMPT,
        model=_get_model(),
        tools=[recall_memory_agentic],
    )
