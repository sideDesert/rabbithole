# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Memory-Native Learning OS — an AI education companion that builds a persistent cognitive model of the learner. Three-layer architecture: Next.js frontend → FastAPI backend → EverMemOS (external memory service at localhost:1995).

The backend implements an agent loop: receive message → detect intent → retrieve memories from EverMemOS → assemble context → call LLM → process response (store memories, update mastery, manage conversation tree). Full design docs live in `docs/plans/`.

## Current State

The project is early-stage with comprehensive design docs but minimal implementation. `backend/main.py` has a basic FastAPI health endpoint. `client/` is empty. All architecture, data models, and MVP phases are documented in `docs/plans/`.

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

# Linting and formatting (once ruff is added)
uv run ruff check .
uv run ruff format .

# Type checking (once pyright is added)
uv run pyright
```

### Frontend (from `client/`, once scaffolded)
```bash
pnpm install
pnpm dev          # localhost:3000
pnpm build
pnpm lint
```

## Architecture

### Agent Loop (5 steps per user message)
1. **Intent Detection** — classify as: learn / test / explore sub-concept / return to parent / resume session / general question. Planned approach: LLM function-calling with tools like `explore_concept()`, `return_to_parent()`, `administer_test()`.
2. **Context Retrieval** — load current ConversationNode, query EverMemOS (episodes, event logs, foresights), load mastery scores, check spaced repetition schedule.
3. **Prompt Assembly** — system prompt + retrieved memories + node context + mastery data + branch-scoped conversation history.
4. **LLM Call** — through provider-agnostic abstraction (must support OpenAI, Anthropic, Google, Groq, Ollama).
5. **Response Processing** — store to EverMemOS, update ConversationNode, score tests, update mastery/spaced repetition, create child nodes if branching.

### Conversation Tree
Branching topic exploration with ConversationNode parent-child relationships. Each node has its own EverMemOS `group_id`. Users can drill into sub-concepts and navigate back to parents. Nodes track status (active/explored/mastered) and depth level.

### Mastery System
Feynman tests scored on 4 dimensions (clarity, accuracy, depth, transferability) → 0.0-1.0 mastery score. Tiers drive spaced repetition scheduling:
- 0.0–0.4 Weak → review in 1-2 days
- 0.4–0.7 Medium → review in 5-7 days
- 0.7–0.9 Strong → review in 2-3 weeks
- 0.9–1.0 Mastered → occasional recall

### Planned Backend Structure
```
backend/app/
├── agent/       # Agent loop, intent detection, context assembly, response routing
├── learning/    # Mastery scorer, test generator, spaced repetition, branching
├── memory/      # EverMemOS HTTP client (httpx)
├── llm/         # LLM provider abstraction (Protocol-based)
├── models/      # SQLAlchemy async models (SQLite MVP → Postgres later)
├── api/         # FastAPI route handlers
├── schemas/     # Pydantic v2 request/response schemas
└── config.py    # App configuration
```

### Key Data Models
- **ConversationNode** — tree node with topic, parent_id, children, status, depth, evermemos_group_id
- **ConceptMastery** — per-concept mastery score (0-1), score history, weak subconcepts, strength trend
- **ReviewSchedule** — spaced repetition entries (pending/triggered/completed)
- **TestResult** — test responses with 4-dimension scoring
- **LearningSession** — groups conversation nodes under a session

### EverMemOS Integration
External service at `http://localhost:1995`. Key endpoints:
- `POST /api/v1/memories` — store conversation messages (returns "accumulated" or "extracted")
- `GET /api/v1/memories/search?user_id=X&query=Y&retrieve_method=rrf&top_k=10` — semantic search (rrf recommended)
- `GET /api/v1/memories?user_id=X&memory_type=episode` — fetch by type (episode/event_log/foresight/profile)
- `POST /api/v1/memories/conversation-meta` — set conversation metadata (scene: "assistant" for 1:1)

EverMemOS is NOT a library — it's a separate Docker service with its own MongoDB, Elasticsearch, Milvus, and Redis.

### LLM Provider Abstraction
Protocol-based interface requiring `chat()` and `chat_structured()` methods. Config-driven provider selection. Structured output via Pydantic models for intent detection, test scoring, etc.

## Ports
| Service | Port |
|---------|------|
| Next.js frontend | 3000 |
| FastAPI backend | 8000 |
| EverMemOS API | 1995 |

## Tech Stack
- **Backend**: Python, FastAPI, OpenRouter
- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, React XYFlow, pnpm
- **Tooling**: Ruff (lint/format), Pyright (types), pytest + pytest-asyncio (tests)


## Open Router
Read https://openrouter.ai/skills/create-agent/SKILL.md and follow the instructions to build an agent using OpenRouter.

## Known Discrepancy
`backend/.python-version` says 3.9 but design docs specify Python 3.12. Resolve before adding type hints that require 3.10+ (e.g., `X | Y` union syntax).
