# Agent Orchestrator Research — Distilled Guide

> Everything you need to know before building the Learn-OS agent loop.
> Sources: Anthropic Engineering, OpenAI Docs, Google ADK, LangChain, PydanticAI, academic papers (2025-2026).

---

## TL;DR — What to Build

Your 5-step pipeline (intent → context → prompt → LLM → post-process) is **already the right architecture**. It's a **single-agent workflow with routing** — the pattern Anthropic explicitly recommends as the default. Don't reach for LangGraph, CrewAI, or multi-agent unless you hit a wall.

**Stack for the agent:**
- **OpenRouter** — single API for all LLM providers (already in your stack)
- **Instructor** — structured output with auto-retry + validation on top of OpenRouter
- **httpx** — async HTTP client for EverMemOS + OpenRouter
- **Pydantic v2** — schemas for intents, scores, tool calls
- **No framework** — raw Python async loop. Frameworks add indirection without value at this scale.

---

## 1. Agent Loop Architecture

### The Spectrum (Anthropic's Guide)

Most apps do NOT need full agents. The hierarchy from simplest to most complex:

```
Augmented LLM → Prompt Chaining → Routing → Parallelization → Orchestrator-Workers → Agents
       ↑                              ↑
   Most apps                    Your Learn-OS
   stop here                    is here
```

**Your architecture is a Routing pattern**: classify intent, then dispatch to the right handler with the right context. This is NOT a full autonomous agent — it's a structured pipeline with an LLM in the middle.

### Your Concrete Loop

```python
async def handle_message(user_msg: str, session: Session) -> Response:
    # 1. INTENT — cheap/fast model, structured output
    intent = await detect_intent(user_msg, session.current_node)

    # 2. CONTEXT — load what the LLM needs to see
    context = await build_context(intent, session)

    # 3. PROMPT — assemble system + context + history
    messages = assemble_prompt(intent, context, session)

    # 4. LLM CALL — capable model, may include tool definitions
    response = await llm.chat(messages, tools=get_tools(intent))

    # 5. POST-PROCESS — side effects, state updates
    await post_process(response, intent, session)

    return response
```

This is NOT a while-loop agent. It's a **single pass per message** with deterministic steps. The only place you might add a loop is if the LLM calls a tool (e.g., `explore_concept`), in which case you process the tool result and make one more LLM call.

### When You'd Add a Loop

Only if a tool call requires a follow-up LLM call:

```python
async def llm_with_tools(messages: list, tools: list, max_rounds: int = 3) -> str:
    for _ in range(max_rounds):
        response = await llm.chat(messages, tools=tools)

        if not response.tool_calls:
            return response.content  # Done — no tools invoked

        # Execute tools, append results, loop back
        for call in response.tool_calls:
            result = await execute_tool(call)
            messages.append({"role": "tool", "content": result, "tool_call_id": call.id})

    return response.content  # Safety cap
```

### ReAct vs Plan-and-Execute — You Don't Need Either

These patterns are for autonomous multi-step agents (web research, code generation). Your pipeline is deterministic. The LLM's job is to **respond**, not to **plan and execute**. Skip this complexity entirely.

---

## 2. Tool Design

### Anthropic's Core Rules

1. **If a human can't tell which tool to use, neither can the LLM.** No overlapping tools.
2. **Fewer tools, higher leverage.** Consolidate related operations.
3. **Tool descriptions are your most powerful lever.** Treat them like onboarding docs for a new hire.
4. **Return semantic data, not IDs.** Names > UUIDs. Human-readable > machine-readable.

### How Many Tools?

**5-10 for a single agent is the sweet spot.** Performance degrades from overlap more than from count. If you need 50+, route to subsets.

### Your Tools (Recommended Set)

Don't define tools for your internal pipeline steps (intent detection, memory retrieval). Those are deterministic code. Tools are for when **the LLM decides** to take an action.

```python
tools = [
    {
        "name": "explore_concept",
        "description": "Branch into a sub-concept. Creates a child node in the conversation tree. "
                       "Use when the user wants to dive deeper into a specific aspect of the current topic.",
        "parameters": {
            "sub_topic": {
                "type": "string",
                "description": "The sub-concept to explore"
            },
        }
    },
    {
        "name": "return_to_parent",
        "description": "Navigate back to the parent topic. Summarizes the current branch and "
                       "returns context to the parent node. Use when the current sub-topic is "
                       "sufficiently explored.",
        "parameters": {}
    },
    {
        "name": "administer_test",
        "description": "Give the user a Feynman test — ask them to explain the concept in their "
                       "own words. Use when enough material has been covered to test comprehension.",
        "parameters": {
            "concept": {"type": "string", "description": "The concept to test"},
            "test_type": {
                "type": "string",
                "enum": ["feynman", "conceptual", "application"],
            },
        }
    },
    {
        "name": "check_mastery",
        "description": "Look up the user's mastery score for a concept. Use to decide whether to "
                       "review, advance, or test.",
        "parameters": {
            "concept": {"type": "string", "description": "Concept name to check"}
        }
    },
    {
        "name": "get_review_schedule",
        "description": "Check what concepts are due for spaced repetition review. Use at session "
                       "start or when the user asks what to study.",
        "parameters": {}
    },
]
```

That's 5 tools. Add more only when you need them.

---

## 3. Structured Output (Intent Detection + Scoring)

### Use Instructor + Pydantic

**Instructor** wraps the OpenAI SDK (which OpenRouter is compatible with) and adds:
- Automatic Pydantic validation of LLM responses
- Auto-retry on validation failure (configurable)
- Works with any OpenAI-compatible API (= OpenRouter)

### Intent Detection

```python
from pydantic import BaseModel, Field
from enum import Enum
import instructor
from openai import AsyncOpenAI

class IntentType(str, Enum):
    LEARN = "learn"
    QUESTION = "question"
    EXPLORE = "explore_sub_concept"
    RETURN = "return_to_parent"
    TEST_RESPONSE = "test_response"
    REVIEW = "review"
    RESUME = "resume_session"
    META = "meta"

class DetectedIntent(BaseModel):
    intent: IntentType
    topic: str | None = Field(default=None, description="Subject the user is asking about")
    reasoning: str = Field(description="Why this intent was selected")

# One-time setup
client = instructor.from_openai(
    AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
    )
)

async def detect_intent(message: str, current_node: ConversationNode) -> DetectedIntent:
    return await client.chat.completions.create(
        model="google/gemini-2.0-flash-001",  # Cheap + fast for classification
        response_model=DetectedIntent,
        max_retries=2,
        messages=[
            {
                "role": "system",
                "content": f"Classify the user's learning intent. "
                           f"Current topic: {current_node.topic}. "
                           f"Status: {current_node.status}.",
            },
            {"role": "user", "content": message},
        ],
    )
```

### Test Scoring

```python
class TestScore(BaseModel):
    clarity: float = Field(ge=0, le=1, description="Can they explain it simply?")
    accuracy: float = Field(ge=0, le=1, description="Is the explanation correct?")
    depth: float = Field(ge=0, le=1, description="Do they understand nuances?")
    transferability: float = Field(ge=0, le=1, description="Can they apply to new situations?")
    overall: float = Field(ge=0, le=1)
    feedback: str = Field(description="Specific, encouraging feedback for the learner")
    weak_areas: list[str] = Field(description="Sub-concepts that need more work")

async def score_test(question: str, response: str, concept: str) -> TestScore:
    return await client.chat.completions.create(
        model="anthropic/claude-sonnet-4",  # Capable model for nuanced scoring
        response_model=TestScore,
        max_retries=2,
        messages=[
            {"role": "system", "content": SCORING_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Concept: {concept}\n"
                           f"Question: {question}\n"
                           f"Student response: {response}",
            },
        ],
    )
```

### Why Not PydanticAI?

PydanticAI is good but adds framework overhead (its own agent loop, dependency injection). Instructor is a thin wrapper — it adds structured output to the raw SDK and nothing else. For your architecture (custom pipeline, not a framework agent), Instructor is the right fit.

---

## 4. Memory & Context Management

### The 2025 Principle: Context Engineering

> "The art of filling the context window with **just the right information** at each step." — LangChain

### Three-Tier Memory (Maps to Your Architecture)

```
┌─────────────────────────────────────────────────┐
│ TIER 1: Short-term (In-memory)                  │
│ Last 10-20 messages from current conversation   │
│ Verbatim. Stored in session object.             │
│ Token budget: ~50% of context allocation        │
├─────────────────────────────────────────────────┤
│ TIER 2: Medium-term (EverMemOS episodes)        │
│ Summaries of previous sessions/nodes            │
│ Query: GET /memories?memory_type=episode        │
│ Token budget: ~30%                              │
├─────────────────────────────────────────────────┤
│ TIER 3: Long-term (EverMemOS search)            │
│ Semantic search over ALL past interactions      │
│ Query: GET /memories/search?retrieve_method=rrf │
│ Token budget: ~20%                              │
└─────────────────────────────────────────────────┘
```

### Context Assembly

```python
async def build_context(intent: DetectedIntent, session: Session) -> Context:
    node = session.current_node

    # Tier 1: Recent conversation (already in memory)
    recent_messages = session.get_recent_messages(limit=15)

    # Tier 2: Node/session summaries from EverMemOS
    episodes = await evermemos.get_memories(
        user_id=session.user_id,
        memory_type="episode",
        group_id=node.evermemos_group_id,
    )

    # Tier 3: Semantic search for relevant past knowledge
    relevant = await evermemos.search(
        user_id=session.user_id,
        query=f"{node.topic} {intent.topic or ''}",
        retrieve_method="rrf",
        top_k=5,
    )

    # Also load mastery data (from app DB, not EverMemOS)
    mastery = await db.get_mastery(session.user_id, node.topic)
    reviews_due = await db.get_pending_reviews(session.user_id)

    return Context(
        recent_messages=recent_messages,
        episodes=episodes,
        relevant_memories=relevant,
        mastery=mastery,
        reviews_due=reviews_due,
    )
```

### Key Insight: EverMemOS Does the Heavy Lifting

You don't need to build your own RAG pipeline. EverMemOS already:
- Extracts atomic facts (EventLog) from conversations
- Creates narrative summaries (Episodes)
- Generates predictive memories (Foresights)
- Provides hybrid search (RRF = reciprocal rank fusion)

Your job is to **query it intelligently** and **assemble the results** into a prompt.

---

## 5. LLM Provider Abstraction

### Use OpenRouter + Instructor

OpenRouter gives you provider-agnostic access through one API. Instructor gives you structured output. Together, they satisfy your requirements without a custom abstraction layer.

```python
from dataclasses import dataclass
from openai import AsyncOpenAI
import instructor

@dataclass
class LLMConfig:
    """Configure different models for different tasks."""
    intent_model: str = "google/gemini-2.0-flash-001"        # Fast, cheap
    teaching_model: str = "anthropic/claude-sonnet-4"         # Good at explanation
    scoring_model: str = "anthropic/claude-sonnet-4"          # Good at nuanced eval
    summarization_model: str = "google/gemini-2.0-flash-001"  # Cheap for summaries

class LLM:
    def __init__(self, api_key: str, config: LLMConfig | None = None):
        self.config = config or LLMConfig()
        self._raw = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )
        self._instructor = instructor.from_openai(self._raw)

    async def chat(self, messages: list[dict], model: str | None = None, **kwargs) -> str:
        """Free-form chat response."""
        response = await self._raw.chat.completions.create(
            model=model or self.config.teaching_model,
            messages=messages,
            **kwargs,
        )
        return response.choices[0].message.content

    async def chat_structured(
        self, messages: list[dict], response_model: type[T], model: str | None = None, **kwargs
    ) -> T:
        """Structured output with validation + retry."""
        return await self._instructor.chat.completions.create(
            model=model or self.config.teaching_model,
            response_model=response_model,
            messages=messages,
            max_retries=2,
            **kwargs,
        )

    async def chat_with_tools(
        self, messages: list[dict], tools: list[dict],
        model: str | None = None, max_rounds: int = 3,
    ) -> ChatResponse:
        """Chat with tool calling support."""
        for _ in range(max_rounds):
            response = await self._raw.chat.completions.create(
                model=model or self.config.teaching_model,
                messages=messages,
                tools=tools,
            )
            msg = response.choices[0].message

            if not msg.tool_calls:
                return ChatResponse(content=msg.content, tool_calls=[])

            return ChatResponse(
                content=msg.content,
                tool_calls=[
                    ToolCall(name=tc.function.name, args=json.loads(tc.function.arguments))
                    for tc in msg.tool_calls
                ],
            )
```

### Model Selection Strategy

| Task | Model | Why |
|------|-------|-----|
| Intent detection | Gemini Flash | Fast, cheap, classification is easy |
| Teaching responses | Claude Sonnet / GPT-4o | Good at explanation, nuanced |
| Test scoring | Claude Sonnet | Best at nuanced evaluation |
| Summarization | Gemini Flash | Cheap, summarization is straightforward |
| Embedding (if needed) | — | EverMemOS handles this internally |

---

## 6. Error Handling

### Three-Layer Defense

```python
import asyncio
import random
from time import time

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, cooldown: float = 60.0):
        self.failure_threshold = failure_threshold
        self.cooldown = cooldown
        self._failures = 0
        self._last_failure = 0.0
        self._open = False

    @property
    def available(self) -> bool:
        if not self._open:
            return True
        if time() - self._last_failure > self.cooldown:
            self._open = False
            return True
        return False

    def record_failure(self):
        self._failures += 1
        self._last_failure = time()
        if self._failures >= self.failure_threshold:
            self._open = True

    def record_success(self):
        self._failures = 0
        self._open = False


async def resilient_call(fn, max_retries: int = 3):
    """Retry with exponential backoff + jitter."""
    for attempt in range(max_retries):
        try:
            return await fn()
        except RateLimitError:
            wait = (2 ** attempt) + random.uniform(0, 1)
            await asyncio.sleep(wait)
        except Exception:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(1)
```

### Key Rules
- **Always cap loops** — `max_rounds=3` on tool-calling loops, `max_retries=3` on API calls
- **Validate structured output** — Instructor does this automatically via Pydantic
- **Timeout everything** — `httpx.AsyncClient(timeout=60.0)`
- **Idempotent tools** — tools should be safe to retry

---

## 7. What NOT to Use

| Don't Use | Why | Use Instead |
|-----------|-----|-------------|
| LangChain | Massive abstraction, hides what's happening, hard to debug | Raw OpenAI SDK + Instructor |
| LangGraph | Overkill for a single-agent routing pipeline | Your own async pipeline |
| CrewAI | Multi-agent framework, you have one agent | Single-agent with routing |
| AutoGen | Research-oriented, not production-ready | Raw implementation |
| LiteLLM | Reported memory leaks, latency at scale | OpenRouter (same goal, managed) |
| Semantic Kernel | Microsoft ecosystem lock-in | Protocol-based abstraction |

**The Anthropic principle:** "Start with simple, direct code. Add complexity only when simpler approaches demonstrably fail."

---

## 8. Architecture Diagram

```
User Message
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ FASTAPI ENDPOINT                                     │
│  POST /api/sessions/{id}/messages                    │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 1. INTENT DETECTION (Gemini Flash, structured)       │
│    → DetectedIntent(intent, topic, reasoning)        │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 2. CONTEXT RETRIEVAL                                 │
│    ├─ App DB: current node, mastery, reviews         │
│    ├─ EverMemOS: episodes (group_id scoped)          │
│    ├─ EverMemOS: search (semantic, rrf, top_k=5)    │
│    └─ Session: recent messages (in-memory)           │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 3. PROMPT ASSEMBLY                                   │
│    system_prompt + context + history + mastery_data   │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 4. LLM CALL (Claude Sonnet via OpenRouter)           │
│    ├─ tools=[explore, return, test, mastery, review] │
│    └─ If tool_call → execute → one more LLM call     │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 5. POST-PROCESS                                      │
│    ├─ Store to EverMemOS (POST /memories)            │
│    ├─ Update ConversationNode (app DB)               │
│    ├─ If test: score → update mastery → schedule     │
│    └─ If branch: create child node                   │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
          JSON Response
```

---

## 9. Implementation Order

1. **LLM wrapper** — `LLM` class with OpenRouter + Instructor. Test it standalone.
2. **EverMemOS client** — httpx wrapper for store/search/fetch. Test against running instance.
3. **Intent detection** — `DetectedIntent` schema + `detect_intent()`. Test with sample messages.
4. **Context builder** — Assemble prompt from DB + EverMemOS. Start with just recent messages.
5. **Agent pipeline** — Wire steps 1-5 together in a single `handle_message()` function.
6. **Tools** — Add `explore_concept` and `return_to_parent` first. Others can wait.
7. **Test scoring** — `TestScore` schema + `score_test()`. Add after basic pipeline works.

---

## 10. Key Sources

- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — **Read this first.** The most authoritative guide.
- [Anthropic: Writing Effective Tools](https://www.anthropic.com/engineering/writing-tools-for-agents) — Tool design principles.
- [Anthropic: Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Memory/context patterns.
- [Instructor Docs](https://python.useinstructor.com/) — Structured output library.
- [OpenRouter Docs](https://openrouter.ai/docs) — Provider-agnostic API.
