# Tech Stack — Memory-Native Learning OS

## Project Structure

```
learning-os/
├── backend/                    # Python FastAPI
│   ├── app/
│   │   ├── agent/              # Agent loop, intent detection, context assembly
│   │   ├── learning/           # Mastery scorer, test generator, spaced repetition
│   │   ├── memory/             # EverMemOS client wrapper
│   │   ├── llm/                # LLM provider abstraction
│   │   ├── models/             # SQLAlchemy models (ConversationNode, ConceptMastery, etc.)
│   │   ├── api/                # FastAPI route handlers
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   └── config.py           # App configuration
│   ├── tests/
│   ├── alembic/                # DB migrations
│   ├── pyproject.toml
│   └── Dockerfile
├── client/                     # Next.js frontend
│   ├── src/
│   │   ├── app/                # Next.js app router
│   │   ├── components/         # React components
│   │   │   ├── chat/           # Chat interface
│   │   │   ├── tree/           # Concept tree (react-xyflow)
│   │   │   └── dashboard/      # Mastery dashboard
│   │   ├── lib/                # API client, utilities
│   │   └── types/              # TypeScript types
│   ├── package.json
│   └── Dockerfile
├── docs/                       # Project documentation (these files)
├── docker-compose.yml          # Full stack: backend + client + EverMemOS infra
└── README.md
```

## Backend Stack

| Category | Choice | Why |
|---|---|---|
| Language | Python 3.12 | Same as EverMemOS, mature AI/ML ecosystem |
| Framework | FastAPI | Async-first, fast, auto-generated OpenAPI docs |
| Server | Uvicorn | ASGI server for FastAPI |
| ORM | SQLAlchemy 2.0 (async) | Industry standard, supports SQLite → Postgres migration |
| DB (MVP) | SQLite + aiosqlite | Zero infrastructure, good enough for prototype |
| DB (prod) | PostgreSQL | Same models, just swap connection string |
| Validation | Pydantic v2 | FastAPI native, type-safe |
| HTTP Client | httpx | Async HTTP for EverMemOS API calls |
| Package Manager | uv | Fast, modern Python package manager |
| Testing | pytest + pytest-asyncio | Standard Python testing |

## Frontend Stack

| Category | Choice | Why |
|---|---|---|
| Framework | Next.js 14+ (App Router) | React + SSR + API routes if needed |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Fast prototyping |
| Tree Visualization | React XYFlow | Interactive node graph for concept tree |
| State Management | Zustand or React Context | Lightweight, depends on complexity |
| HTTP Client | fetch / SWR | Built-in + caching |

## LLM Integration

Provider-agnostic design. Single interface, multiple implementations.

```python
class LLMProvider(Protocol):
    async def chat(self, messages: list[Message], **kwargs) -> str: ...
    async def chat_structured(self, messages: list[Message], schema: type[T], **kwargs) -> T: ...
```

| Provider | SDK | Notes |
|---|---|---|
| OpenAI | `openai` | GPT-4o, GPT-4.1 |
| Anthropic | `anthropic` | Claude Sonnet/Opus |
| Google | `google-genai` | Gemini |
| OpenRouter | `openai` (compatible) | Multi-model, pay-per-use |
| Ollama | `openai` (compatible) | Free, local, good for prototyping |

**MVP strategy:** Start with whichever free/cheap option is available (Ollama locally, or OpenRouter with free tier). Abstract it so swapping is a config change.

## EverMemOS Integration

Not a library dependency — a **service** we call via HTTP.

```
Backend ──HTTP──→ EverMemOS API (localhost:1995)
                      │
                      ├── MongoDB (27017)
                      ├── Elasticsearch (9200)
                      ├── Milvus (19530)
                      └── Redis (6379)
```

All EverMemOS infrastructure is managed by its own `docker-compose.yaml`. Our `docker-compose.yml` extends or references it.

## Development Tooling

| Tool | Purpose |
|---|---|
| uv | Python package management |
| Ruff | Linting + formatting (replaces black + isort + flake8) |
| Pyright | Type checking |
| pytest | Testing |
| Docker Compose | Local development environment |
| pnpm | Node package management (frontend) |

## Ports (local dev)

| Service | Port |
|---|---|
| Next.js frontend | 3000 |
| FastAPI backend | 8000 |
| EverMemOS API | 1995 |
| MongoDB | 27017 |
| Elasticsearch | 9200 |
| Milvus | 19530 |
| Redis | 6379 |
