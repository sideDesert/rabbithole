# Rabbithole — Vision & Product Overview

> A Memory-Native Learning OS that builds a persistent cognitive model of the learner.

## Elevator Pitch

Rabbithole is an AI learning companion that doesn't just answer questions — it **remembers** what you know, **tests** your understanding with Feynman-style explanations, identifies **exactly where** your knowledge breaks down across four dimensions, and uses **spaced repetition** to ensure concepts stick. Unlike ChatGPT, knowledge compounds across sessions.

---

## Core Value Propositions

1. **Persistent Memory** — Every conversation, test score, and struggle is stored via EverMemOS Cloud. The system builds a long-term learner profile that improves teaching quality over time. No more starting from zero.

2. **Branching Exploration (Rabbit Holes)** — Encounter a confusing term? Branch into a focused thread. Learn the prerequisite. Return to the parent and continue seamlessly. Branches can nest recursively, mirroring natural curiosity.

3. **Multi-Dimensional Mastery Scoring** — Not binary pass/fail. Feynman tests evaluate understanding on four orthogonal dimensions: clarity, accuracy, depth, and transferability (0.0–1.0 each). This pinpoints *exactly* where understanding breaks down.

4. **Spaced Repetition (Ebbinghaus Agent)** — Weak concepts auto-schedule for review at scientifically optimal intervals. A proactive agent nudges you to review at the right time — not forced, but persistent.

5. **Knowledge Graph** — A visual map of all learned concepts, prerequisites, mastery status, and relationships. See your learning landscape evolve in real-time.

---

## User Experience Flow

### Starting a Topic
1. User types a topic ("Teach me Rust ownership")
2. **Interview Phase** — Agent asks 3–5 skill assessment questions to gauge background and depth preference
3. **Planning Phase** — Agent generates a structured markdown learning plan (phases → concepts with dependencies). User reviews and can request adjustments before approving.
4. **Teaching Phase** — Agent works through the plan incrementally, checking understanding along the way

### The Learning Loop
1. Agent teaches a concept conversationally (not a wall of text)
2. Suggests 2–3 related concepts as "rabbit holes" to explore
3. When a subtopic is complete → **Feynman Test** triggers
4. User explains the concept back in a rich text editor
5. LLM scores the explanation on 4 dimensions → mastery score (0.0–1.0)
6. Results shown: strengths, weak areas, next steps
7. Weak concepts get scheduled for spaced repetition review

### Branching (Rabbit Holes)
Two ways to branch:
- **Text Selection** — Highlight text in a message → click "Branch" to explore that concept
- **Suggested Branches** — Agent suggests related concepts after each subtopic

Each branch is a full conversation thread with its own memory context. Parent conversation is compacted and injected as context. Users can branch recursively and return to any parent via breadcrumbs.

### Returning Sessions
1. Dashboard shows overdue reviews, active threads, and progress
2. Ebbinghaus agent prompts: "You learned X 5 days ago. Quick review?"
3. User can continue where they left off, start new topics, or review

---

## Implemented Features

### Phase-Based Agent System
Three phases, each with different tools and system prompts:

| Phase | Purpose | Key Tools | Transition |
|-------|---------|-----------|------------|
| **Interview** | Assess learner background | `recall_memory`, `store_memory`, `present_interview` | Agent calls `create_plan` |
| **Planning** | Generate learning roadmap | `recall_memory`, `store_memory`, `create_plan` | User approves plan |
| **Teaching** | Deliver content & test | `recall_memory`, `store_memory`, `suggest_branches`, `read_plan`, `update_plan_progress`, `trigger_feynman` | — |

### Feynman Testing & Scoring
- Rich text editor (BlockNote) for writing explanations
- Auto-save drafts to localStorage
- Hint system available during explanation
- 4-dimension scoring: Clarity, Accuracy, Depth, Transferability
- Detailed feedback with specific weak areas identified
- Mastery tiers drive review scheduling:
  - 0.0–0.4 **Weak** → review in 1–2 days
  - 0.4–0.7 **Medium** → review in 5–7 days
  - 0.7–0.9 **Strong** → review in 2–3 weeks
  - 0.9–1.0 **Mastered** → occasional recall

### Learning Plans
- Stored as human-readable markdown (`backend/plans/{topic}/plan.md`)
- Parsed into phases → concepts with completion tracking
- Frontend renders interactive checklist with progress bars
- Concepts can be marked complete manually or via agent

### Knowledge Graph Visualization
- Interactive graph built with React Flow + D3 force layout
- Node types: Concepts (colored by mastery tier), Topic Hubs, Memory Hubs, Thread Nodes
- Edge types: Prerequisites, Part-of, Explored-from, Confused-with
- Mini-map, domain filter, stats bar (total concepts, mastered, in-progress)
- Click a concept → preview panel with mastery %, trend, weak areas, related threads

### Ebbinghaus Spaced Repetition
- Separate agent checks for overdue concepts
- Persistent notification thread at `/ebbinghaus`
- Chat-like interface for review prompts
- User can accept review (re-test → score update) or dismiss

### Practice & Testing
- Scheduled review tests driven by Ebbinghaus schedule
- Self-test on any completed concept anytime
- LLM generates tailored questions based on mastery tier
- Dashboard carousel for due reviews

### Branching Conversation Tree
- Branch from text selection or suggested concepts
- Parent conversation compacted via LLM summary
- Child gets parent context injected
- Each branch has its own EverMemOS group_id
- Recursive branching supported
- Return to parent via breadcrumbs/links

### Chat & Streaming
- SSE streaming from FastAPI → Next.js client
- Tool calls and results streamed as separate events
- Multiple message types: text, markdown, plan_card, tool_call, tool_result, feynman_input, notification
- Whimsical "Thought Trail" indicator with rotating phrases ("Piecing things together", "Letting it marinate", etc.)

### Interview Modal System
- Agent calls `present_interview` → modal renders with MCQ questions
- Structured answers submitted back to agent in same stream

### Dashboard
- "Continue Learning" carousel (recent topics with progress)
- "Tests" carousel (due Ebbinghaus reviews)
- Searchable thread list (groupable by topic)
- Start new topic card

---

## Architecture

### Three-Layer Stack
```
Next.js Frontend (port 3000)
    ↓ HTTP/SSE
FastAPI Backend (port 8000)
    ↓ HTTP
EverMemOS Cloud (api.evermind.ai)
```

### Agent Loop (OpenAI Agents SDK)
Per user message:
1. Load thread from MongoDB (phase, topic, user profile)
2. Build context (load plan, find current concept, recall memories)
3. Build phase-specific Agent via `build_agent(phase=...)`
4. `Runner.run_streamed()` — SDK owns the LLM ↔ tool-calling loop
5. Stream SSE events to client (text deltas, tool calls, tool results)
6. Persist response to MongoDB + EverMemOS
7. Check phase transitions

### Backend Structure
```
backend/app/
├── agent/          # Phase prompts + transition logic
├── api/            # FastAPI routes (chat SSE, practice, feynman, graph)
├── models/         # MongoDB models (Thread, Message, BranchPoint, ConceptMastery)
├── schemas/        # Pydantic schemas (scoring, plans)
├── services/       # Concept extraction, mastery logic
├── memory/         # EverMemOS HTTP client
├── db/             # MongoDB client + indexes
├── agent_core.py   # Agent factory
├── tools_impl.py   # All @function_tool implementations
├── plan_parser.py  # Markdown plan parser
└── config.py       # Configuration
```

### Frontend Structure
```
client/
├── app/            # Pages: dashboard, feynman, ebbinghaus, threads, practice, knowledge-graph
├── components/     # Chat UI, plan view, graph, modals, thought trail
├── hooks/          # useChat, useBranch, useThread, etc.
└── lib/            # API client, graph layout, types
```

### Key Data Models (MongoDB)
- **threads** — conversation thread with phase, topic, parent/child relationships, depth
- **messages** — chat messages with role, content, type
- **branch_points** — links parent thread + message to child thread with text position
- **concept_mastery** — per-concept scores, history, weak subconcepts
- **concept_relationships** — prerequisite/part-of/confused-with edges
- **review_schedule** — spaced repetition schedule per concept

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind CSS v4 |
| UI Components | shadcn/ui, React Flow, BlockNote, React Arborist, Embla Carousel |
| State Management | TanStack React Query v5, React Context |
| Backend | Python 3.12, FastAPI, OpenAI Agents SDK |
| LLM Provider | OpenRouter (`openrouter/hunter-alpha`) |
| Database | MongoDB Atlas |
| Memory | EverMemOS Cloud (api.evermind.ai) |
| HTTP Client | httpx (backend), fetch (frontend) |
| Tooling | Ruff, Basedpyright, pytest, pnpm |

---

## What Makes Rabbithole Unique

1. **Memory-native** — Not a bolt-on. Memory is the foundation. The system gets better at teaching YOU specifically over time.

2. **Branching, not linear** — Learning isn't a straight line. Rabbithole lets you dive into rabbit holes and return, matching how curiosity actually works.

3. **Four-dimensional scoring** — Pinpoints exactly where understanding breaks down (clarity vs accuracy vs depth vs transferability), not just "wrong."

4. **Proactive review** — The Ebbinghaus agent reaches out when it's time to review, rather than waiting for you to remember to practice.

5. **Whimsical personality** — Thought trail indicators, playful copy, and a warm tone make the learning experience feel human, not clinical.

6. **Plans as markdown** — Human-readable, inspectable, versionable learning plans. Not opaque JSON blobs.

---

## Project Status

**Stage**: Hackathon build (March 2026)

**Working**: Core agent loop, SSE streaming, branching conversations, learning plans, Feynman testing & scoring, spaced repetition, knowledge graph, dashboard, EverMemOS integration, practice/testing system

**In Progress**: Feynman modal polish, weak subconcepts wiring, memory graph, evaluation dashboard

**Future**: Production deployment, web search integration, mastery decay curves, adaptive teaching pace, multi-user testing
