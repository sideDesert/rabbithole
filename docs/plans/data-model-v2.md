# Data Model v2 — Memory-Native Learning OS

Supersedes `data-model.md`. Simplified for hackathon. Uses MongoDB Atlas (cloud) instead of SQLite.

---

## Database: MongoDB Atlas

Single database with collections. No ORM — use `pymongo` directly.

---

## Collections

### threads

The branching conversation tree. Each thread is a focused exploration of one topic.

```
threads
├── _id: ObjectId
├── user_id: string                  # EverMemOS user_id — needed for all memory queries
├── title: string                    # "Rust ownership", "Borrow checker"
├── topic_slug: string               # normalized slug e.g. "rust/ownership" — maps to plans/{slug}/
├── summary: string | null           # filled when thread is closed — LLM-generated summary of what was learned
├── status: string                   # "active" | "explored" | "mastered"
├── depth: int                       # 0 = root, 1 = first branch, etc. — useful for tree layout
├── parent_thread_id: ObjectId | null   # null = root thread
├── root_thread_id: ObjectId         # always points to top-level thread (self if root)
├── branch_point_id: ObjectId | null # which branch_point spawned this (null for root)
├── agent: string                    # "feynman" | "ebbinghaus"
├── evermemos_group_id: string       # maps to EverMemOS group_id for this thread
├── created_at: datetime
├── updated_at: datetime
└── closed_at: datetime | null       # when exploration of this thread finished
```

**Thread status:**
| Status | Meaning | Tree UI |
|---|---|---|
| `active` | Currently being explored | Bright/highlighted node |
| `explored` | User finished exploring but hasn't mastered | Default node |
| `mastered` | User demonstrated mastery via Feynman test | Green/completed node |

**Key points:**
- `user_id` is stored on every collection so EverMemOS queries always have it available
- `topic_slug` maps directly to the filesystem learning plan path: `plans/{topic_slug}/plan.md`
- `root_thread_id` enables one query to fetch the entire tree: `db.threads.find({root_thread_id: X})`
- `agent` determines which persona runs this thread (system prompt, avatar, behavior)
- Each thread gets its own EverMemOS `group_id` so memories are scoped per-topic
- `summary` is generated when a thread is closed — used for tree tooltips and context when returning
- `depth` is computed from parent chain — useful for limiting branch depth and tree layout

---

### messages

All chat messages within threads.

```
messages
├── _id: ObjectId
├── user_id: string                  # EverMemOS user_id
├── thread_id: ObjectId              # which thread this belongs to
├── role: string                     # "user" | "assistant" | "system"
├── content: string                  # message text
├── type: string                     # "text" | "markdown" | "feynman_input" | "tool_call" | "tool_result"
├── status: string                   # "pending" | "streaming" | "complete" | "error"
├── group_id: string                 # groups related messages (e.g., retry, tool chain, multi-part response)
├── index: int                       # order within group (0-based)
├── created_at: datetime
└── updated_at: datetime
```

**Key points:**
- `group_id` groups related messages together — e.g., a tool call + tool result + final answer are one group
- `index` orders messages within a group
- `type` determines frontend rendering:
  - `text` — plain text bubble
  - `markdown` — rendered markdown (for teaching content)
  - `feynman_input` — special input area where user explains a concept back
  - `tool_call` — shows what tool the agent is invoking
  - `tool_result` — shows tool output
- `status` enables streaming UX and progress indicators

---

### branch_points

Records where in a conversation a branch happened. Serves as both a bookmark (where user left off) and a link between parent and child threads.

```
branch_points
├── _id: ObjectId
├── thread_id: ObjectId              # which thread this is on (the parent)
├── message_id: ObjectId             # which message the user was reading
├── position: object | null          # null if no text was highlighted
│   ├── start: int                   # character offset start
│   └── end: int                     # character offset end
├── type: string                     # "highlight" | "explore" | "feynman"
├── child_thread_id: ObjectId        # the thread that was created from this branch
├── created_at: datetime
└── updated_at: datetime
```

**Branch point types:**
| Type | Trigger | UI |
|---|---|---|
| `highlight` | User selected specific text to explore | Highlighted text with link icon |
| `explore` | User clicked "explore concept" (no text selection) | Marker at end of message |
| `feynman` | User branched to take a Feynman test | Test icon on message |

**Key points:**
- Every branch creates a branch_point, even if no text was highlighted (`position` is null)
- `child_thread_id` links directly to the spawned thread
- The frontend uses branch_points to render highlights, markers, and navigation affordances
- When user returns from a child thread, the branch_point tells the frontend where to scroll to

---

## Agent Personas

Two agents with distinct roles. Not stored in a collection — hardcoded in backend config with system prompts.

### Feynman (primary teaching agent)
- Teaches through intuition, analogy, and simplification
- Runs all learning threads
- Tools: `create_learning_plan()`, `get_current_plan()`, `update_plan_progress()`, `create_notes()`, `recall_about_user()`, `remember()`
- Triggers Feynman tests after sufficient exploration

### Ebbinghaus (spaced repetition agent)
- Strict reviewer focused on recall and retention
- Sends review messages within existing threads (not a branch — just a message)
- Surfaces weak concepts based on mastery scores and time since last review
- Does NOT create new threads — operates within the user's current context

**Ebbinghaus trigger: on session start.**
When the user starts a new session (or opens the app), the backend:
1. Queries `review_schedule` for `status: "pending"` and `scheduled_for <= now()`
2. If pending reviews exist, Ebbinghaus sends a message in the current thread listing concepts due for review
3. User can choose to review now or dismiss
4. On review completion, `review_schedule` status → `"completed"`, mastery scores updated, next review scheduled

---

## EverMemOS Integration

Same as before — external service at `http://localhost:1995`.

| Our Data | EverMemOS Storage | Reference |
|---|---|---|
| Thread messages | MemCells → Episodes + EventLogs + Foresights | Via `group_id` (one per thread) |
| Learning context | Episode memories | Search by user_id + topic query |
| Specific facts learned | EventLog records | Search for atomic facts |
| Upcoming reviews | Foresight records | Time-filtered queries |
| Learner profile | Profile memory | Fetch by user_id |

---

## Memory Loop

**Always store, selectively retrieve.**

### Storing (every message)
Every user and assistant message is sent to EverMemOS via `POST /api/v1/memories`. EverMemOS handles extraction (episodes, event logs, foresights) automatically.

### Retrieving (selective)
Context is fetched from EverMemOS at these trigger points:
- **Thread creation** — always fetch relevant memories for the new topic
- **Every 5 messages** — refresh context within a long thread
- **Agent tool call** — Feynman can explicitly call `recall_about_user(query)` to search memories
- **Feynman test start** — fetch mastery history and past learning for the concept

---

## Learning Plans (filesystem)

Stored as markdown on the local filesystem, not in MongoDB. Easy to inspect and debug.

```
plans/
  rust/
    plan.md              # ordered concept list, dependencies, progress checkboxes
    notes/
      ownership.md       # generated notes/summaries as user learns
      borrowing.md
  calculus/
    plan.md
    notes/
      limits.md
```

Feynman's tools for plan management:
- `create_learning_plan(topic)` — LLM generates structured plan, saved as markdown
- `get_current_plan()` — reads plan to determine next concept
- `update_plan_progress(concept, status)` — marks concepts complete
- `create_notes(concept, content)` — saves learning summaries

---

## Mastery & Spaced Repetition

Kept from v1 but simplified. Stored in MongoDB.

### concept_mastery

```
concept_mastery
├── _id: ObjectId
├── user_id: string                  # EverMemOS user_id
├── concept_name: string             # normalized concept identifier
├── mastery_score: float             # 0.0 - 1.0
├── attempts: int                    # number of times tested
├── last_reviewed: datetime
├── last_score: float
├── score_history: float[]
├── weak_subconcepts: string[]
├── strength_trend: string           # "improving" | "stable" | "declining"
├── related_concepts: string[]       # linked concepts — builds the knowledge graph
├── created_at: datetime
└── updated_at: datetime
```

### review_schedule

```
review_schedule
├── _id: ObjectId
├── user_id: string                  # EverMemOS user_id
├── concept_id: ObjectId             # FK to concept_mastery
├── scheduled_for: datetime
├── status: string                   # "pending" | "triggered" | "completed" | "skipped"
├── triggered_at: datetime | null
├── completed_at: datetime | null
├── result_score: float | null
├── created_at: datetime
└── updated_at: datetime
```

**Mastery tiers → review intervals:**
| Range | Level | Review Interval |
|---|---|---|
| 0.0 - 0.4 | Weak | 1-2 days |
| 0.4 - 0.7 | Medium | 5-7 days |
| 0.7 - 0.9 | Strong | 2-3 weeks |
| 0.9 - 1.0 | Mastered | Occasional recall |

### test_results

```
test_results
├── _id: ObjectId
├── user_id: string                  # EverMemOS user_id
├── concept_id: ObjectId
├── thread_id: ObjectId              # where the test happened
├── test_type: string                # "feynman" | "conceptual" | "application"
├── question: string
├── user_response: string
├── scores: object
│   ├── clarity: float               # 0.0 - 1.0
│   ├── accuracy: float
│   ├── depth: float
│   └── transferability: float
├── overall_score: float
├── feedback: string                 # LLM-generated
└── created_at: datetime
```

### learning_sessions

Groups threads into a time-bounded session. Useful for "resume where I left off" and dashboard views.

```
learning_sessions
├── _id: ObjectId
├── user_id: string                  # EverMemOS user_id
├── root_thread_id: ObjectId         # the starting thread
├── title: string                    # "Rust Memory Management"
├── started_at: datetime
├── ended_at: datetime | null
├── concepts_covered: string[]       # concepts touched in this session
├── summary: string | null           # session-level summary
└── created_at: datetime
```

---

## Indexes

```javascript
// threads
db.threads.createIndex({ root_thread_id: 1 })
db.threads.createIndex({ parent_thread_id: 1 })
db.threads.createIndex({ user_id: 1, topic_slug: 1 })

// messages
db.messages.createIndex({ thread_id: 1, created_at: 1 })
db.messages.createIndex({ group_id: 1, index: 1 })

// branch_points
db.branch_points.createIndex({ thread_id: 1 })
db.branch_points.createIndex({ child_thread_id: 1 })

// concept_mastery
db.concept_mastery.createIndex({ user_id: 1, concept_name: 1 }, { unique: true })

// review_schedule
db.review_schedule.createIndex({ status: 1, scheduled_for: 1 })

// learning_sessions
db.learning_sessions.createIndex({ root_thread_id: 1 })
db.learning_sessions.createIndex({ ended_at: 1 })
```
