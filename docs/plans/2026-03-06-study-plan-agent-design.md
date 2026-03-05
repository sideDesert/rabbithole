# Study Plan Agent — Design Document

**Date:** 2026-03-06
**Status:** Approved
**Scope:** Backend agent architecture for learning plan generation and Feynman-style teaching

---

## Overview

A single agent with three phases — Interview, Planning, Teaching — powered by Atomic Agents framework with OpenRouter as the LLM provider. The agent assesses the learner, generates an expert-depth curriculum as a markdown file, then teaches through it topic by topic using Feynman-style pedagogy.

SSE (Server-Sent Events) over HTTP, not WebSocket.

## Architecture

### Framework Stack

| Layer | Choice | Why |
|---|---|---|
| Agent Runtime | [Atomic Agents](https://github.com/BrainBlend-AI/atomic-agents) v2.7+ | Lightweight, Pydantic I/O schemas, built on Instructor, full control over agent loop |
| Structured Output | Instructor (bundled with Atomic Agents) | Pydantic-validated LLM responses with auto-retry |
| LLM Provider | OpenRouter via `AsyncOpenAI(base_url=...)` | Provider-agnostic, Instructor-native |
| Transport | FastAPI `StreamingResponse` (SSE) | Simple, stateless, no connection management |
| Plan Storage | Filesystem markdown | Human-readable, git-friendly, parseable to tree |

### Three-Phase Lifecycle

```
User: "I want to learn async Rust"
         │
         ▼
┌─────────────────────────────────────────────────┐
│  PHASE 1: INTERVIEW                              │
│  Tools: Memory, Interview                        │
│                                                   │
│  1. Query Memory for user profile, past sessions  │
│  2. Only ask what Memory doesn't already know      │
│  3. Assess: experience level, goals, desired depth │
│  4. Agent decides it has enough context → calls    │
│     create_plan → transitions to Phase 2           │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│  PHASE 2: PLANNING                               │
│  Tools: Memory, Plan, Web Search                  │
│                                                   │
│  1. Query Memory for mastery scores, weak areas    │
│  2. Web Search for curriculum structure/resources   │
│  3. Generate expert-depth markdown plan             │
│  4. Present plan to user for approval/edits         │
│  5. User approves → transitions to Phase 3          │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│  PHASE 3: TEACHING                               │
│  Tools: Memory, Web Search, Branch Suggestion,    │
│         Plan (read/update), Interview              │
│                                                   │
│  1. Parse plan → find first uncompleted concept    │
│  2. Teach Feynman-style (intuition, analogies)     │
│  3. Mark concepts complete as covered (- [x])      │
│  4. Suggest branches when relevant                  │
│  5. Store memories as teaching progresses           │
│  6. Interview tool available for mid-lesson         │
│     clarification (no phase change)                 │
└─────────────────────────────────────────────────┘
```

### Phase Transitions

| Transition | Trigger | System Action |
|---|---|---|
| Interview → Planning | Agent calls `create_plan` tool | `thread.phase = "planning"`, emit `phase_change` SSE event, serialize interview answers into plan context |
| Planning → Teaching | User sends approval message | `thread.phase = "teaching"`, emit `phase_change` SSE event, parse plan into tree, identify first concept |
| Teaching → Interview (soft) | Agent calls `interview` tool mid-lesson | No phase change — just a tool call within teaching |

## Tool Definitions

### 1. Memory Tool (dummy implementation for now)

Available in: **all phases**

```python
# recall
class MemoryRecallInput(BaseIOSchema):
    query: str                    # semantic search string
    memory_type: str | None       # "episode" | "event_log" | "foresight" | "profile" | None

class MemoryRecallOutput(BaseIOSchema):
    memories: list[dict]          # matched memories from EverMemOS

# remember
class MemoryStoreInput(BaseIOSchema):
    fact: str                     # observation to store

class MemoryStoreOutput(BaseIOSchema):
    status: str                   # "stored"
```

Dummy returns empty list for recall, "stored" for remember. Interface matches EverMemOS API for future integration:
- `POST /api/v1/memories` → store
- `GET /api/v1/memories/search?user_id=X&query=Y&retrieve_method=rrf&top_k=10` → recall

### 2. Interview Tool

Available in: **interview phase, teaching phase**

```python
class InterviewInput(BaseIOSchema):
    purpose: str                  # why the agent needs to ask
    num_questions: int            # 1-5
    question_type: str            # "multiple_choice" | "open_ended" | "scale"

class InterviewQuestion(BaseIOSchema):
    text: str                     # the question
    options: list[str] | None     # for MCQ (A/B/C/D)
    context: str                  # why this question matters

class InterviewOutput(BaseIOSchema):
    questions: list[InterviewQuestion]
```

The agent generates questions via an internal LLM sub-call, renders them as formatted markdown in the chat. User responds naturally, agent interprets.

### 3. Plan Tool

Available in: **planning phase (full), teaching phase (read/update only)**

```python
# create
class PlanCreateInput(BaseIOSchema):
    topic: str
    user_context: str             # serialized interview + memory context
    depth: str                    # "overview" | "intermediate" | "deep_dive" | "expert"

class PlanCreateOutput(BaseIOSchema):
    plan_content: str             # full markdown
    plan_path: str                # filesystem path
    concept_count: int
    phase_count: int

# read
class PlanReadInput(BaseIOSchema):
    topic_slug: str

class PlanReadOutput(BaseIOSchema):
    plan_content: str
    tree: PlanTree                # parsed tree structure

# update progress
class PlanUpdateInput(BaseIOSchema):
    topic_slug: str
    concept_name: str             # concept to mark complete

class PlanUpdateOutput(BaseIOSchema):
    updated: bool
    phase_progress: float         # progress of the phase this concept belongs to
    overall_progress: float       # progress across all phases
```

### 4. Web Search Tool

Available in: **planning, teaching**

```python
class WebSearchInput(BaseIOSchema):
    query: str
    num_results: int              # 3-10
    search_type: str              # "curriculum" | "explanation" | "resource"

class SearchResult(BaseIOSchema):
    title: str
    url: str
    snippet: str

class WebSearchOutput(BaseIOSchema):
    results: list[SearchResult]
```

Search provider TBD (SearXNG, Tavily, Serper). Placeholder for now.

### 5. Branch Suggestion Tool

Available in: **teaching phase only**

```python
class BranchSuggestionInput(BaseIOSchema):
    current_topic: str
    context: str                  # what user asked or expressed interest in

class BranchSuggestion(BaseIOSchema):
    topic: str                    # suggested sub-topic
    reason: str                   # why relevant
    depth_estimate: str           # "quick detour" | "deep dive"

class BranchSuggestionOutput(BaseIOSchema):
    suggestions: list[BranchSuggestion]
```

Returns suggestions rendered as clickable chips in the UI. Does NOT create threads — user action does.

### Tool Availability Per Phase

```python
PHASE_TOOLS = {
    "interview": [MemoryTool, InterviewTool],
    "planning":  [MemoryTool, PlanCreateTool, WebSearchTool],
    "teaching":  [MemoryTool, WebSearchTool, BranchSuggestionTool,
                  PlanReadTool, PlanUpdateTool, InterviewTool],
}
```

## Markdown Plan Format

### Structure

```markdown
# Async Rust: From Futures to Runtime Internals

> **Depth:** Expert | **Phases:** 6 | **Generated for:** siddarth
> **Prior knowledge:** Rust basics, some tokio usage, no runtime internals

---

## Phase 1: The Why — Concurrency Problems That Async Solves
- [ ] The C10K problem — why threads don't scale for I/O-bound workloads
- [ ] Thread-per-connection model — memory overhead, context switching costs
- [ ] Event-driven architecture — select/poll/epoll/kqueue evolution
- [ ] Green threads vs async/await — Go's approach vs Rust's zero-cost approach
- [ ] Why Rust chose not to include a runtime — the stdlib philosophy

## Phase 2: Futures — The Core Abstraction
- [ ] What a Future represents — a value that doesn't exist yet
- [ ] The Future trait — poll(cx: &mut Context) -> Poll<T>
- [ ] Lazy vs eager futures — why Rust futures do nothing until polled
- [ ] State machine desugaring — how async fn compiles to an enum
- [ ] Pin and Unpin — why self-referential structs need pinning
- [ ] Building a future by hand — implementing Future without async syntax

## Phase 3: The Executor
- [ ] What an executor does — the poll loop
- [ ] Single-threaded executor — build one from scratch
- [ ] Waker and RawWaker — how futures signal readiness
- [ ] Wake-by-ref vs wake-by-value — the vtable approach
- [ ] Work-stealing — tokio's multi-threaded scheduler design
- [ ] block_on vs spawn — blocking the thread vs spawning a task
```

### Parsing Rules

- `#` heading → topic title (root node)
- `>` blockquote → metadata (depth, prior knowledge, etc.)
- `##` headings → phase nodes (depth 1 in tree)
- `- [ ]` items → uncompleted concept leaves (depth 2)
- `- [x]` items → completed concept leaves
- Concept format: `Name — Description` (split on ` — `)
- Phase progress = `checked / total` per `##` section
- Overall progress = `checked / total` across all sections

### Parsed Tree

```python
@dataclass
class PlanTree:
    topic: str
    slug: str
    depth: str                    # "overview" | "intermediate" | "deep_dive" | "expert"
    prior_knowledge: str
    phases: list[PlanPhase]
    overall_progress: float

@dataclass
class PlanPhase:
    title: str
    order: int
    concepts: list[PlanConcept]
    progress: float               # computed: checked / total

@dataclass
class PlanConcept:
    name: str                     # "The C10K problem"
    description: str              # "why threads don't scale for I/O-bound workloads"
    completed: bool
    order: int
```

Plans stored at: `plans/{topic_slug}/plan.md`

## Agent Runtime

### OpenRouter + Atomic Agents Setup

```python
import instructor
from openai import AsyncOpenAI
from atomic_agents.agents.base_agent import BaseAgent, BaseAgentConfig
from atomic_agents.lib.components.system_prompt_generator import SystemPromptGenerator
from atomic_agents.lib.components.agent_memory import AgentMemory

client = instructor.from_openai(
    AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.OPENROUTER_API_KEY,
    )
)
```

### Phase-Aware System Prompts

```python
PHASE_PROMPTS = {
    "interview": SystemPromptGenerator(
        background=[
            "You are Mr. Feynman, a brilliant teacher who makes complex topics intuitive.",
            "You are conducting an initial assessment of the learner before creating their study plan.",
            "Use the Memory tool first to check what you already know about this learner.",
            "Only ask what you don't already know from memory.",
        ],
        steps=[
            "Query memory for user profile and past learning sessions",
            "Use the Interview tool to generate focused assessment questions",
            "Assess: experience level, goals, desired depth, time commitment",
            "When you have enough context, call create_plan to generate the curriculum",
        ],
        output_instructions=[
            "Keep questions conversational, not like a quiz",
            "Render interview questions as formatted markdown with clear options",
            "3-7 questions total across the interview phase",
        ]
    ),
    "planning": SystemPromptGenerator(
        background=[
            "You are generating an expert-depth learning curriculum.",
            "The plan must be comprehensive — cover history, motivation, problem statements, internals.",
            "Not a tutorial outline. A senior engineer's learning roadmap.",
            "Adapt depth and coverage based on the learner's interview answers and memory context.",
        ],
        steps=[
            "Review interview answers and memory context",
            "Search web for curriculum structure and authoritative resources",
            "Generate plan with phases and deeply detailed concept lists",
            "Present plan to user for approval — they can request changes",
        ],
        output_instructions=[
            "Each concept should have a name and description separated by ' — '",
            "Use checkbox format: - [ ] Concept — description",
            "Group into logical phases with ## headings",
            "Include metadata blockquote at top with depth, prior knowledge",
        ]
    ),
    "teaching": SystemPromptGenerator(
        background=[
            "You are Mr. Feynman teaching through an approved study plan.",
            "Teach one concept at a time. Build intuition before formalism.",
            "Use analogies, examples, and 'imagine if...' thought experiments.",
            "Never dump walls of text. Incremental delivery, check understanding.",
        ],
        steps=[
            "Check the plan to find the current uncompleted concept",
            "Teach using Feynman method — simplify, use analogies, build up",
            "Check understanding as you go — ask the learner to rephrase",
            "When concept is covered, call update_plan_progress to mark it complete",
            "Suggest branches when the learner shows curiosity about related topics",
        ],
        output_instructions=[
            "One concept at a time — don't rush ahead",
            "Use code examples where relevant",
            "Store important observations about the learner to memory",
            "Use branch suggestions for rabbit holes, don't force them",
        ]
    ),
}
```

### SSE Endpoint

```python
@app.post("/api/chat/{thread_id}")
async def chat(thread_id: str, message: UserMessage):
    async def event_stream():
        # 1. Load thread, determine phase
        thread = await db.threads.find_one({"_id": thread_id})
        phase = thread["phase"]

        # 2. Configure agent for current phase
        agent = BaseAgent(
            config=BaseAgentConfig(
                client=client,
                model=settings.LLM_MODEL,
                system_prompt_generator=PHASE_PROMPTS[phase],
                memory=load_memory(thread_id),
            )
        )
        register_tools(agent, PHASE_TOOLS[phase])

        # 3. Stream response
        async for chunk in agent.stream_response_async(input_schema):
            yield f"data: {json.dumps({'type': 'stream', 'content': chunk.chat_message})}\n\n"

        # 4. Handle tool calls (emitted as events)
        # 5. Handle phase transitions
        # 6. Persist to DB + EverMemOS

        yield f"data: {json.dumps({'type': 'end'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### SSE Event Types

```
data: {"type": "stream", "content": "Let me explain..."}
data: {"type": "tool_call", "name": "create_plan", "args": {...}}
data: {"type": "tool_result", "name": "create_plan", "result": {...}}
data: {"type": "interview_questions", "questions": [...]}
data: {"type": "branch_suggestions", "suggestions": [...]}
data: {"type": "phase_change", "from": "interview", "to": "planning"}
data: {"type": "plan_update", "concept": "...", "completed": true}
data: {"type": "end"}
```

### Tool Execution Flow

1. LLM returns a tool call in its response
2. Agent pauses streaming → emit `tool_call` SSE event
3. Execute tool (Python function)
4. Emit `tool_result` SSE event
5. Feed result back to LLM
6. Resume streaming with LLM's response incorporating tool result
7. Up to 5 tool rounds per message

## Thread State

```python
class Thread:
    _id: str
    user_id: str
    title: str
    topic_slug: str               # links to plans/{slug}/plan.md
    phase: str                    # "interview" | "planning" | "teaching"
    interview_context: dict       # serialized interview Q&A
    current_concept: str | None   # what's being taught now
    status: str                   # "active" | "explored" | "mastered"
    depth: int
    parent_thread_id: str | None
    root_thread_id: str | None
    agent: str                    # "feynman" | "ebbinghaus"
    evermemos_group_id: str
    created_at: datetime
    updated_at: datetime
```

## API Endpoints

```
POST   /api/chat/{thread_id}              SSE streaming chat
POST   /api/threads                       Create new thread (starts interview phase)
GET    /api/threads/{thread_id}           Get thread details
GET    /api/threads/{thread_id}/progress  Get plan progress (parsed tree)
GET    /api/threads                       List user's threads
```

## Session Resume Flow

1. Load thread from DB → check `phase`
2. If `teaching` → parse plan markdown → find first uncompleted `- [ ]` concept
3. Query Memory Tool for what was discussed last time
4. System prompt includes: "User is returning. Last topic was X. Next uncompleted concept is Y."
5. Agent picks up naturally

## Concept Coverage Tracking

Binary state only — covered or not covered:
- `- [ ]` in markdown = not covered
- `- [x]` in markdown = covered
- Agent calls `update_plan_progress(concept_name)` when done with a concept
- Phase progress = `checked_count / total_count` per `##` section
- Overall progress = `checked_count / total_count` across all sections
- Markdown is the single source of truth

## Out of Scope (for now)

- Administer test / Feynman test scoring (post-phase completion, future work)
- Ebbinghaus spaced repetition agent
- Mastery scoring (4-dimension)
- EverMemOS actual integration (Memory tool is dummy)
- Web Search actual provider (placeholder)
- Branch thread creation (suggestions only, no auto-create)
- Authentication (single-user prototype)

## Dependencies

```
atomic-agents>=2.7.0
instructor>=1.6.0
openai>=1.0.0         # AsyncOpenAI for OpenRouter
pydantic>=2.0
fastapi
uvicorn
httpx                  # for EverMemOS client (future)
```
