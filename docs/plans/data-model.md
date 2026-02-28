# Data Model — Memory-Native Learning OS

Two storage layers: our **application database** (conversation tree, mastery, scheduling) and **EverMemOS** (long-term semantic memory). They serve different purposes and reference each other by IDs.

---

## Application Database (our backend)

### ConversationNode

The branching conversation tree. Each node is a focused exploration of one concept.

```
ConversationNode
├── id: uuid
├── session_id: uuid              # groups nodes into a learning session
├── user_id: string
├── parent_id: uuid | null        # null = root node
├── topic: string                 # "Rust ownership", "Borrow checker"
├── summary: string | null        # filled when node is closed
├── status: enum                  # active | explored | mastered
├── depth: int                    # 0 = root, 1 = first branch, etc.
├── children: uuid[]              # child node IDs
├── evermemos_group_id: string    # maps to EverMemOS group_id for this node
├── created_at: datetime
├── updated_at: datetime
└── closed_at: datetime | null
```

**Key relationships:**
- Each node gets its own `group_id` in EverMemOS, so memories are scoped per-topic
- `parent_id` creates the tree structure
- `status` tracks exploration progress

### ConceptMastery

Persistent concept tracking across all sessions. This is the learner's knowledge graph.

```
ConceptMastery
├── id: uuid
├── user_id: string
├── concept_name: string          # normalized concept identifier
├── mastery_score: float          # 0.0 - 1.0
├── attempts: int                 # number of times tested
├── last_reviewed: datetime
├── last_score: float             # most recent test score
├── score_history: float[]        # trend tracking
├── weak_subconcepts: string[]    # identified weak areas
├── strength_trend: enum          # improving | stable | declining
├── related_concepts: string[]    # linked concepts
├── created_at: datetime
└── updated_at: datetime
```

**Mastery score interpretation:**
| Range | Level | Review Interval |
|---|---|---|
| 0.0 - 0.4 | Weak | 1-2 days |
| 0.4 - 0.7 | Medium | 5-7 days |
| 0.7 - 0.9 | Strong | 2-3 weeks |
| 0.9 - 1.0 | Mastered | Occasional long-term test |

### ReviewSchedule

Spaced repetition scheduling. Each record is a pending or completed review.

```
ReviewSchedule
├── id: uuid
├── user_id: string
├── concept_id: uuid              # FK to ConceptMastery
├── scheduled_for: datetime       # when to trigger review
├── status: enum                  # pending | triggered | completed | skipped
├── triggered_at: datetime | null
├── completed_at: datetime | null
├── result_score: float | null    # score from the review test
├── created_at: datetime
└── updated_at: datetime
```

### TestResult

Records of individual test administrations.

```
TestResult
├── id: uuid
├── user_id: string
├── concept_id: uuid              # FK to ConceptMastery
├── node_id: uuid                 # FK to ConversationNode where test happened
├── test_type: enum               # feynman | conceptual | application
├── question: string
├── user_response: string
├── scores: object
│   ├── clarity: float            # 0.0 - 1.0
│   ├── accuracy: float
│   ├── depth: float
│   └── transferability: float
├── overall_score: float
├── feedback: string              # LLM-generated feedback
├── created_at: datetime
└── updated_at: datetime
```

### LearningSession

Groups conversation nodes into a time-bounded session.

```
LearningSession
├── id: uuid
├── user_id: string
├── root_node_id: uuid            # the starting topic
├── title: string                 # "Rust Memory Management"
├── started_at: datetime
├── ended_at: datetime | null
├── concepts_covered: string[]    # concepts touched in this session
├── summary: string | null        # session-level summary
└── created_at: datetime
```

---

## EverMemOS Storage (managed by EverMemOS)

We don't manage this directly — EverMemOS handles it. But here's what maps where:

| Our Concept | EverMemOS Storage | How We Reference It |
|---|---|---|
| Conversation messages | MemCells → Episodes + EventLogs + Foresights | Via `group_id` (one per ConversationNode) |
| Learning context | Episode memories | Search by user_id + semantic query |
| Specific facts learned | EventLog records | Search for atomic facts |
| Upcoming reviews | Foresight records | Time-filtered queries |
| Learner profile | Profile memory | Fetch by user_id |

---

## Mapping Between Layers

```
ConversationNode (our DB)
    │
    ├── evermemos_group_id ──→ EverMemOS group_id
    │                          (all messages in this node stored here)
    │
    ├── topic ──→ used as search query against EverMemOS
    │
    └── children[] ──→ child ConversationNodes (our DB)

ConceptMastery (our DB)
    │
    ├── concept_name ──→ search key against EverMemOS EventLogs
    │
    └── mastery_score ──→ drives ReviewSchedule timing

ReviewSchedule (our DB)
    │
    └── concept_id ──→ ConceptMastery ──→ EverMemOS search for review context
```

---

## Database Choice

For MVP: **SQLite** (via SQLAlchemy async + aiosqlite). Simple, no extra infrastructure.

For production: **PostgreSQL**. Same SQLAlchemy models, just change the connection string.

EverMemOS already brings MongoDB, Elasticsearch, Milvus, and Redis. We don't want to add more infrastructure for the MVP.
