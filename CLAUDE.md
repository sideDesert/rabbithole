# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Memory-Native Learning OS — an AI education companion that builds a persistent cognitive model of the learner. Three-layer architecture: Next.js frontend → FastAPI backend → EverMemOS Cloud (hosted memory service at api.evermind.ai).

The backend uses the **OpenAI Agents SDK** to run a phase-based agent loop: receive message → build phase-specific Agent (interview/planning/teaching) → `Runner.run_streamed()` handles LLM + tool-calling loop → stream SSE events to client → persist response and check phase transitions.

## Current State

Working prototype with a functional agent loop, SSE streaming chat, branching conversation threads, and markdown learning plans. The frontend has thread management, chat UI, and plan viewing. Mastery scoring and spaced repetition are defined in schemas but not yet wired into the agent loop.

## Commands

### Backend (from `backend/`)
```bash
# Run dev server
uv run uvicorn main:app --reload --port 8000

# Install dependencies
uv sync

# Add a dependency
uv add <package>

# Run tests
uv run pytest

# Run a single test
uv run pytest tests/test_foo.py::test_bar -v

# Run tool integration tests
uv run python test_tools.py

# Linting and formatting
uv run ruff check .
uv run ruff format .

# Type checking (use basedpyright, not pyright — matches Zed's checker)
npx basedpyright
```

### Frontend (from `client/`)
```bash
pnpm install
pnpm dev          # localhost:3000
pnpm build
pnpm lint
```

## Architecture

### Agent Harness (OpenAI Agents SDK)

The agent is built on the `openai-agents` SDK. Per user message:

1. **Load thread** from MongoDB — get phase, topic_slug, user_id, group_id.
2. **Build context** — load the learning plan, find current uncompleted concept.
3. **Build Agent** via `build_agent(phase=...)` — selects tools and system prompt for the current phase.
4. **Run streamed** — `Runner.run_streamed(agent, input=history+message, context=agent_ctx)`. The SDK owns the tool-calling loop (LLM → tool calls → tool results → LLM → repeat until final text).
5. **Stream SSE** — text deltas, tool call notifications, and tool results forwarded to client.
6. **Persist** — save response to MongoDB and EverMemOS Cloud.
7. **Phase transitions** — check if tools triggered a state change (e.g., `create_plan` → interview→planning).

### Phase System

Three phases, each with different tools and system prompts:

| Phase | Tools | Trigger to next |
|-------|-------|-----------------|
| **interview** | `recall_memory`, `store_memory`, `create_plan` | Agent calls `create_plan` → planning |
| **planning** | `recall_memory`, `store_memory`, `create_plan` | User approves plan → teaching |
| **teaching** | `recall_memory`, `store_memory`, `suggest_branches`, `read_plan`, `update_plan_progress` | — |

### Tools (`app/tools_impl.py`)

All tools use `@function_tool` from the Agents SDK and receive `AgentContext` (user_id, thread_id, topic_slug, group_id) via `RunContextWrapper`.

| Tool | What it does |
|------|-------------|
| `recall_memory` | Semantic search over EverMemOS Cloud |
| `store_memory` | Persist an observation about the learner |
| `create_plan` | Generate a markdown learning plan via a second LLM call, save to `backend/plans/<slug>/plan.md` |
| `read_plan` | Read plan from disk, report progress and next concept |
| `update_plan_progress` | Mark a concept as completed in the plan markdown |
| `suggest_branches` | Ask the LLM for 2-3 sub-topics worth exploring |

### Conversation Tree
Branching topic exploration with Thread parent-child relationships. Each thread has its own EverMemOS `group_id`. Users can branch from any assistant message into a sub-topic. Branch creation compacts the parent conversation into a summary via LLM.

### Mastery System (schemas defined, not yet wired)
Feynman tests scored on 4 dimensions (clarity, accuracy, depth, transferability) → 0.0-1.0 mastery score. Tiers drive spaced repetition scheduling:
- 0.0–0.4 Weak → review in 1-2 days
- 0.4–0.7 Medium → review in 5-7 days
- 0.7–0.9 Strong → review in 2-3 weeks
- 0.9–1.0 Mastered → occasional recall

### Backend Structure
```
backend/app/
├── agent/         # Phase prompts (prompts.py) and transition logic (phases.py)
├── agent_core.py  # Agent factory: build_agent() creates phase-specific Agents
├── tools_impl.py  # All @function_tool implementations + AgentContext dataclass
├── plan_parser.py # Parse markdown plans into PlanTree/PlanPhase/PlanConcept
├── memory/        # EverMemOS Cloud HTTP client (httpx)
├── models/        # Pydantic models for MongoDB docs (thread, message, branch_point, mastery)
├── schemas/       # Pydantic schemas (scoring, plans)
├── db/            # MongoDB client + index setup
├── api/           # FastAPI route handlers (chat.py has SSE streaming + CRUD)
└── config.py      # App configuration (OpenRouter, MongoDB, EverMemOS)
```

### Key Data Models
- **Thread** — conversation thread with phase, topic_slug, parent/child relationships, depth, evermemos_group_id
- **Message** — chat message with role, content, type (text/markdown/plan_card/tool_call/tool_result)
- **BranchPoint** — links parent thread + message to child thread, with optional text position
- **ConceptMastery** — per-concept mastery score (0-1), score history, weak subconcepts

### EverMemOS Cloud Integration
Hosted service at `https://api.evermind.ai`. Authenticated via Bearer token (`EVERMEMOS_API` env var). API version: `/api/v0/`.

Key endpoints:
- `POST /api/v0/memories` — store conversation messages (returns "queued" for async extraction)
- `GET /api/v0/memories/search?user_id=X&query=Y&retrieve_method=rrf&top_k=10` — semantic search (rrf recommended)
- `GET /api/v0/memories?user_id=X&memory_type=episodic_memory` — fetch by type (episodic_memory/event_log/foresight/profile)
- `POST /api/v0/memories/conversation-meta` — set conversation metadata (scene: "assistant" for 1:1)

EverMemOS Cloud handles memory extraction, indexing, and retrieval. No local Docker setup needed.

### LLM Provider
All LLM calls go through **OpenRouter** (`https://openrouter.ai/api/v1`) using the `openai` Python client. Model: `openrouter/hunter-alpha`. Configured in `app/config.py` — single provider, no toggle.

## Ports
| Service | Port |
|---------|------|
| Next.js frontend | 3000 |
| FastAPI backend | 8000 |

## Tech Stack
- **Backend**: Python 3.12, FastAPI, OpenAI Agents SDK, OpenRouter, MongoDB, httpx
- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, pnpm
- **Memory**: EverMemOS Cloud (api.evermind.ai)
- **Tooling**: Ruff (lint/format), Pyright (types), pytest + pytest-asyncio (tests)

## Environment Variables (`backend/.env`)
```
OPENROUTER_API_KEY=     # OpenRouter API key
EVERMEMOS_API=          # EverMemOS Cloud bearer token
MONGO_USER=             # MongoDB Atlas username
MONGO_PASSWORD=         # MongoDB Atlas password
```
