# Architecture — Memory-Native Learning OS

## System Overview

Three layers, each with a clear responsibility:

```
┌─────────────────────────────────────────────┐
│              Next.js Frontend               │
│         (client/)                            │
│  Chat UI · Concept Tree · Mastery Dashboard │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────┐
│           FastAPI Backend                    │
│         (backend/)                           │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Agent Loop   │  │ Learning Engine      │  │
│  │              │  │                      │  │
│  │ - Context    │  │ - Mastery Scorer     │  │
│  │   assembly   │  │ - Test Generator     │  │
│  │ - LLM calls  │  │ - Spaced Repetition  │  │
│  │ - Response   │  │ - Branching Manager  │  │
│  │   routing    │  │                      │  │
│  └──────┬───────┘  └──────────┬───────────┘  │
│         │                     │              │
│  ┌──────▼─────────────────────▼───────────┐  │
│  │        Application Database            │  │
│  │  (Conversation Tree · Mastery Scores   │  │
│  │   Spaced Repetition Schedule)          │  │
│  └────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────┘
                   │ HTTP API
┌──────────────────▼──────────────────────────┐
│           EverMemOS                          │
│  (Long-term memory backend)                  │
│                                              │
│  MongoDB · Elasticsearch · Milvus · Redis    │
│  Memory extraction · Semantic search         │
└──────────────────────────────────────────────┘
```

## The Main Agent Loop

This is the core of the system — the cycle that runs on every user message.

```
User Message
    │
    ▼
┌─ 1. Determine Intent ─────────────────────────┐
│  What does the user want?                      │
│  - Learn something new                         │
│  - Answer a test question                      │
│  - Explore a sub-concept                       │
│  - Return to parent topic                      │
│  - Resume a previous session                   │
│  - Ask a general question                      │
└────────────────┬───────────────────────────────┘
                 │
                 ▼
┌─ 2. Retrieve Context ─────────────────────────┐
│  a. Load current conversation tree node        │
│  b. Query EverMemOS for relevant memories      │
│     - Episode memories (past learning sessions)│
│     - EventLogs (what user knows/struggles with)│
│     - Foresights (scheduled reviews)           │
│  c. Load mastery scores for related concepts   │
│  d. Check spaced repetition schedule           │
└────────────────┬───────────────────────────────┘
                 │
                 ▼
┌─ 3. Assemble Prompt ──────────────────────────┐
│  System prompt + retrieved memories +          │
│  current node context + mastery data +         │
│  conversation history (current branch)         │
└────────────────┬───────────────────────────────┘
                 │
                 ▼
┌─ 4. LLM Call ─────────────────────────────────┐
│  Send assembled prompt to LLM provider         │
│  (provider-agnostic interface)                 │
└────────────────┬───────────────────────────────┘
                 │
                 ▼
┌─ 5. Process Response ─────────────────────────┐
│  a. Send message to EverMemOS for storage      │
│  b. Update conversation tree node              │
│  c. If test was administered:                  │
│     - Score the response                       │
│     - Update mastery scores                    │
│     - Update spaced repetition schedule        │
│  d. If new concept detected:                   │
│     - Create child node (branch available)     │
│  e. If exploration complete:                   │
│     - Summarize node                           │
│     - Offer return to parent                   │
└────────────────────────────────────────────────┘
```

## Component Breakdown

### Agent Loop (`backend/app/agent/`)
The orchestrator. Receives user messages, determines intent, assembles context, calls LLM, processes results. Stateless per-request — all state lives in the database and EverMemOS.

### Learning Engine (`backend/app/learning/`)

**Mastery Scorer** — Evaluates test responses across dimensions:
- Clarity (can they explain it simply?)
- Accuracy (is the explanation correct?)
- Depth (do they understand nuances?)
- Transferability (can they apply it to new situations?)

Outputs a 0-1 mastery score per concept.

**Test Generator** — Creates adaptive assessments:
- Feynman explanation requests ("Explain X as if teaching a beginner")
- Conceptual questions ("What happens when...")
- Application problems ("Given this scenario, how would you...")

Question difficulty scales with current mastery score.

**Spaced Repetition Scheduler** — Manages review timing:
- Weak (0.0-0.4): review in 1-2 days
- Medium (0.4-0.7): review in 5-7 days
- Strong (0.7-0.9): review in 2-3 weeks
- Mastered (0.9+): occasional long-term recall

**Branching Manager** — Handles conversation tree operations:
- Create child node (explore sub-concept)
- Summarize and close node
- Navigate back to parent
- Track active node per session

### EverMemOS Integration (`backend/app/memory/`)
Thin client that wraps EverMemOS API calls:
- `store_message()` — POST to `/api/v1/memories`
- `search_memories()` — GET from `/api/v1/memories/search`
- `fetch_memories()` — GET from `/api/v1/memories`
- `set_conversation_meta()` — configure scene/user details

### LLM Provider Abstraction (`backend/app/llm/`)
Provider-agnostic interface:
```
LLMProvider (protocol/interface)
    ├── OpenAIProvider
    ├── AnthropicProvider
    ├── GoogleProvider
    └── OpenRouterProvider (or any OpenAI-compatible)
```

Switch providers via config without changing application code.

## Data Flow Example: "Explore a Sub-Concept"

```
User: "What does 'ownership' mean in Rust?"
  (while studying "Rust memory management")

1. Intent: EXPLORE_CONCEPT
2. Context:
   - Current node: "Rust memory management" (parent)
   - EverMemOS search("rust ownership"):
     → past episode where user briefly mentioned ownership
     → EventLog: "user has not studied ownership in depth"
   - Mastery: ownership = 0.1 (barely touched)
3. Agent creates child node: "Rust ownership"
4. LLM generates teaching response with ownership context
5. Messages stored to EverMemOS
6. UI shows "exploring: Rust ownership" with "back to parent" option

... several exchanges about ownership ...

7. Agent triggers Feynman test
8. User explains ownership back
9. Mastery scorer: clarity=0.7, accuracy=0.8, depth=0.5 → score=0.65
10. Node summarized, marked "explored"
11. Spaced repetition: review ownership in 5-7 days
12. User returned to "Rust memory management" parent node
```

## Inter-Service Communication

```
Frontend ←→ Backend:     REST API (JSON)
Backend  ←→ EverMemOS:   REST API (JSON) — localhost:1995
Backend  ←→ App DB:      Direct connection (SQLite/Postgres)
Backend  ←→ LLM:         Provider SDK (HTTP)
```

All communication is async. The backend is the single point of orchestration.
