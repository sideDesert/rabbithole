# Rabbithole

**ChatGPT taught you something last week. Do you remember what it was?**

Neither does it.

---

Rabbithole is an AI learning companion that actually remembers you. It builds a persistent cognitive model of how you think, what you know, and where you struggle — across sessions, across weeks, across months.

It doesn't just answer questions. It teaches you, tests you, and makes sure you don't forget.

## The Problem

Every AI learning session starts from zero. You spend 45 minutes getting ChatGPT to explain Rust ownership, close the tab, come back tomorrow, and it has no idea who you are. There's no mastery tracking, no structured exploration, no mechanism to reinforce what you learned. You get the **illusion** of learning without the retention.

## How Rabbithole Works

**You say:** "Teach me Rust ownership."

**Rabbithole:**
1. Checks what you already know (from past sessions and your learner profile)
2. Generates a structured learning plan tailored to your level
3. Teaches you incrementally — not a wall of text, a conversation
4. When you hit a confusing term, you branch into a **rabbit hole** — a focused sub-thread that dives deep, then brings you back to where you left off
5. Once you've explored enough, Mr. Feynman tests you: *"Explain ownership back to me like you're teaching a beginner"*
6. Scores your explanation across clarity, accuracy, depth, and transferability
7. Schedules a review for the concepts you're weakest on
8. Next time you open the app: *"You learned about borrowing 3 days ago. Quick review?"*

Your knowledge compounds. Your gaps get filled. Nothing falls through the cracks.

## Core Concepts

### Branching Exploration (The Rabbit Hole)
Learning isn't linear. When you encounter "borrow checker" while studying ownership, you can branch into it — explore it fully in its own thread — then jump back to the parent and continue. The conversation tree tracks where you've been and where you're going.

### Feynman Testing
> *"If you can't explain it simply, you don't understand it well enough."*

After exploring a topic, Rabbithole asks you to teach it back. An LLM scores your explanation on four dimensions and identifies exactly where your understanding breaks down.

### Persistent Memory
Built on [EverMemOS](https://github.com/anthropics/evermemos) — a structured memory backend that extracts episodes, facts, and predictions from every conversation. Rabbithole remembers what you studied, what you struggled with, and what you need to review. Across sessions. Across weeks.

### Spaced Repetition
Weak concepts don't just get a score — they get a schedule. Ebbinghaus (our review agent) surfaces concepts at optimal intervals so you retain what you learn.

## Architecture

```
Next.js Frontend  ──REST──►  FastAPI Backend  ──HTTP──►  EverMemOS
   (Chat + Tree)              (Agent Loop)              (Long-term Memory)
                                   │
                                   ├── Mr. Feynman (teaching agent)
                                   ├── Ebbinghaus (review agent)
                                   ├── MongoDB Atlas (app data)
                                   └── OpenRouter (LLM provider)
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 14+, TypeScript, Tailwind CSS, React XYFlow |
| Backend | Python 3.12, FastAPI, httpx, Instructor, Pydantic v2 |
| Database | MongoDB Atlas |
| Memory | EverMemOS (MongoDB, Elasticsearch, Milvus, Redis) |
| LLM | OpenRouter (model-agnostic) |

## Getting Started

```bash
# Backend
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000

# Frontend
cd client
pnpm install
pnpm dev

# EverMemOS (separate service)
# See docs/plans/evermemos-reference.md
```

## Project Status

Early-stage hackathon build. Comprehensive design docs in [`docs/plans/`](docs/plans/). Building fast.

---

*Go down the rabbit hole. Come back smarter.*
