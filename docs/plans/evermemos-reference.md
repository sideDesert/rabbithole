# EverMemOS — Quick Reference

Cheatsheet for the memory backend we're building on top of.

**Base URL:** `http://localhost:1995`
**Docs:** `http://localhost:1995/docs` (Swagger UI)

---

## What EverMemOS Does (and Doesn't)

**Does:**
- Ingests conversation messages
- Detects topic boundaries automatically
- Extracts structured memories (episodes, facts, predictions) via LLM
- Stores across MongoDB / Elasticsearch / Milvus
- Retrieves via keyword, vector, or hybrid search

**Does NOT:**
- Run an agent loop
- Manage conversation flow
- Generate LLM responses
- Handle UI or user interaction
- Make decisions about what to do next

It's a **smart memory store with semantic search**. Nothing more.

---

## Memory Types

### MemCell (atomic unit)
- The smallest memory container
- Created when a topic boundary is detected in the conversation stream
- One MemCell → multiple downstream memories

### Episode Memory
- Narrative summary of a conversation segment
- Two sub-types: **Group Episode** (third-person) and **Personal Episode** (first-person, per participant)
- Available in both assistant and group_chat scenes

### EventLog (assistant scene only)
- Individual atomic facts extracted from a MemCell
- ~5-15 per MemCell
- Example: `"User explained recursion correctly but confused base case with edge case"`

### Foresight (assistant scene only)
- Predictive memories about future needs
- Has `start_time`, `end_time`, `duration_days`
- ~4-10 per MemCell
- Example: `"User should review linked lists before attempting tree problems"`

### Profile Memory
- Persistent user attributes
- Fetchable but NOT searchable
- Sub-types: UserProfile, GroupProfile, GroupUserProfileMemory

---

## APIs

### Store a Message
```http
POST /api/v1/memories
Content-Type: application/json

{
  "message_id": "msg_001",
  "create_time": "2025-01-15T10:00:00+00:00",
  "sender": "user_001",
  "content": "I think I understand recursion now...",
  "group_id": "session_123",
  "sender_name": "Learner",
  "role": "user"
}
```

**Response status_info:**
- `"accumulated"` — message queued, boundary not yet triggered
- `"extracted"` — boundary fired, memories extracted and stored

### Search Memories
```http
GET /api/v1/memories/search?user_id=user_001&query=recursion&retrieve_method=rrf&top_k=10
```

**Retrieve methods:**

| Method | Latency | Use When |
|---|---|---|
| `keyword` | 50-100ms | Exact term lookups |
| `vector` | 200-500ms | Semantic similarity |
| `rrf` | 200-600ms | **Recommended default** — balanced hybrid |
| `hybrid` | 200-600ms | keyword + vector + rerank |
| `agentic` | 2-10s | Complex queries needing LLM judgment |

### Fetch Memories by Type
```http
GET /api/v1/memories?user_id=user_001&memory_type=episode&page=1&page_size=20
```

Memory types: `episode`, `event_log`, `foresight`, `profile`

### Conversation Metadata
```http
POST /api/v1/memories/conversation-meta
{
  "group_id": "session_123",
  "scene": "assistant",
  "user_details": {
    "user_001": {"name": "Learner", "role": "student"}
  },
  "default_timezone": "America/Los_Angeles"
}
```

### Delete Memories
```http
DELETE /api/v1/memories?event_id=xxx&user_id=yyy&group_id=zzz
```
Soft delete. Filter by any combination of event_id, user_id, group_id.

### Health Check
```http
GET /health
```

---

## Multi-Tenancy

All operations are scoped by `user_id` and/or `group_id`. At least one must be provided for fetch/search. They can't both be `__all__`.

## Scenes

| Scene | Extracts |
|---|---|
| `assistant` (1:1) | Episodes + Foresight + EventLog |
| `group_chat` | Episodes only (group + personal per participant) |

For our Learning OS, we use `assistant` scene — it extracts all memory types.

---

## Infrastructure

Started via `docker-compose up -d`:

| Service | Purpose | Port |
|---|---|---|
| MongoDB | Document store | 27017 |
| Elasticsearch | BM25 keyword search | 9200 |
| Milvus | Vector semantic search | 19530 |
| Redis | Cache + locks | 6379 |
| EverMemOS API | Memory service | 1995 |

---

## How We Use Each Memory Type

| Our Need | Memory Type | How |
|---|---|---|
| "What did the learner study before?" | Episode | Search for past session narratives |
| "Does the learner understand X?" | EventLog | Search for atomic facts about concept understanding |
| "What should be reviewed soon?" | Foresight | Query with time filters for upcoming reviews |
| "Who is this learner?" | Profile | Fetch user profile |
| "What concepts relate to this topic?" | EventLog + Episode | Semantic search across both |

---

## Key Config (env vars)

```bash
LLM_PROVIDER=         # openai / anthropic / google / openrouter
LLM_API_KEY=           # provider API key
LLM_MODEL=             # model name
VECTORIZE_PROVIDER=    # deepinfra / vllm
VECTORIZE_API_KEY=     # embedding API key
RERANK_PROVIDER=       # deepinfra / vllm
RERANK_API_KEY=        # reranker API key
MEMORY_LANGUAGE=en     # en / zh
MOCK_MODE=true         # skip real LLM calls for dev
```
