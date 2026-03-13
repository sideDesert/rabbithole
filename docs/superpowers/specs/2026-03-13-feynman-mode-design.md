# Feynman Mode — Design Spec

## Overview

Feynman mode is a "teach it back" experience where the learner explains a concept in their own words using a Notion-style block editor. It appears as a full-screen modal overlay on the chat page after completing a subsection. An async scoring agent evaluates the explanation in the background and delivers results later.

## Entry Points

Three ways to open Feynman mode, all setting the same state (`feynmanOpen: true`, `feynmanConcept: string`):

1. **Agent-triggered**: The agent calls a `trigger_feynman` tool which sets `agent_ctx.feynman_concept = concept_name`. After the agent run completes, the SSE loop in `chat.py` checks for this field and emits a `feynman_prompt` event — following the same pattern as `present_interview` / `interviewQuestions`. The agent is expected to call this after teaching a subsection.
2. **User-initiated**: A button in the chat UI (near the input or in the plan view next to each concept) opens the modal for the current/selected concept. This is a stretch goal — can be cut from MVP if needed.

Note: Entry points 1 covers the "auto-trigger after subsection" case — the agent decides when to trigger based on its teaching progress. There is no separate auto-trigger mechanism.

## Modal Shell

- **Full-screen overlay** on the chat page, dimming the background.
- **Header**: Concept name displayed prominently — e.g., "Explain: Rust Ownership" — with a close button (top-right). Closing prompts "Discard explanation?" if content exists.
- **Body**: BlockNote editor filling available space.
- **Footer**: Prominent "Submit" button.

## Editor

**Library**: [BlockNote](https://www.blocknotejs.org/) — a React Notion-clone built on Tiptap/ProseMirror.

**Available block types**: Headings (H1-H3), paragraphs, bullet lists, numbered lists, code blocks, blockquotes. No images or embeds — this is a writing exercise.

**Slash menu**: BlockNote's built-in slash menu with one custom command:
- `/hint` — calls the backend hint endpoint, returns a nudge string. The hint appears as a dismissable banner at the top of the editor (muted background, subtle border). Multiple hints stack.

**Draft persistence**: Editor content is saved to `localStorage` keyed by `{thread_id}:{concept_name}`. Restored on reopen. Cleared on successful submit. This prevents accidental loss if the browser closes.

**Why BlockNote**: Ships drag handles, slash menu, block types, and markdown serialization out of the box. Theming via CSS variables matches the existing shadcn/Tailwind setup. ~30KB gzipped.

## `/hint` Command

**Behavior**: When the learner types `/hint` in the slash menu:
1. Frontend calls `POST /api/feynman/hint` with `{ thread_id, concept_name, current_content? }`.
2. Backend makes an LLM call with the following context:
   - The concept name and its position in the learning plan
   - The conversation history for this thread (what was taught)
   - The learner's current explanation draft (if provided) — to avoid hinting about things already covered
3. Returns `{ hint: string, hint_id: string }` — a single nudge sentence (e.g., "Consider what happens when a variable goes out of scope").
4. Hint appears as a dismissable banner at the top of the editor.
5. Each hint invocation is logged to MongoDB (`feynman_hints` collection) with `{ _id, thread_id, concept_name, hint_text, timestamp }`.

**Purpose**: Hint usage is signal for the scoring agent — it identifies where the learner struggled and needed help.

## Submit Flow

When the learner clicks "Submit":
1. BlockNote editor content is serialized to markdown.
2. Frontend calls `POST /api/feynman/submit` with `{ thread_id, concept_name, markdown, hint_ids: [<hint_id>, ...] }`.
3. Modal closes. localStorage draft is cleared.
4. A brief toast notification appears: "Explanation submitted — scoring in progress".
5. Backend returns `202 Accepted` and queues the async scoring workflow.

`hint_ids` is an array of hint document `_id` strings referencing the `feynman_hints` collection. This avoids duplicating hint text across collections.

## Backend

### New SSE Event

```json
{ "type": "feynman_prompt", "concept_name": "Rust Ownership" }
```

Emitted by the SSE loop in `chat.py` after the agent run completes, when `agent_ctx.feynman_concept` is set. Handled by the frontend's `useChat` hook to open the modal.

### New Router

Endpoints live in a new `app/api/feynman.py` router (separate from `chat.py`), mounted with prefix `/api/feynman`.

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/feynman/hint` | POST | Takes `{ thread_id, concept_name, current_content? }`, makes LLM call with thread context + plan context, returns `{ hint: string, hint_id: string }`, logs to `feynman_hints` |
| `POST /api/feynman/submit` | POST | Takes `{ thread_id, concept_name, markdown, hint_ids }`, saves submission, sets `status: "scoring"`, queues scoring job, returns `202 Accepted` |

### New Agent Tool

`trigger_feynman(concept_name: str)` — sets `agent_ctx.feynman_concept = concept_name`. Does NOT emit SSE directly. The post-run SSE loop in `chat.py` checks for this field and emits the `feynman_prompt` event (same pattern as `present_interview` setting `agent_ctx.interview_questions`).

### Scoring Job

The `/submit` endpoint saves the explanation to the existing `test_results` collection (reusing the existing `TestResult` model with `test_type: "feynman"`) and kicks off a background task (`asyncio.create_task` for MVP).

The submission document is saved with `status: "scoring"` so failed scoring can be detected and retried.

The scoring agent receives:
- The explanation markdown
- Hint log (referenced via `hint_ids` → `feynman_hints` collection)
- Conversation history for the concept thread
- The plan's expected coverage (strong topics, weak topics, topics discussed but missed)

Produces a scorecard using the existing `TestScore` schema:
- Scores on 4 dimensions: clarity, accuracy, depth, transferability (0.0-1.0)
- `overall_score` (weighted average)
- `feedback` (written feedback string)
- `weak_areas` (list of areas needing work)

Additional fields on the `TestResult` document:
- `strong_topics`: topics the learner explained well
- `missed_topics`: topics from the conversation that were absent from the explanation
- `improvements`: specific suggestions

On completion, `status` is updated to `"scored"`. On failure, `status` is set to `"failed"`.

The scorecard is saved to MongoDB. Delivery to the user is via a separate section (TBD, out of scope for this spec).

### Database Changes

**Reused collection**: `test_results` — existing collection, extended with `test_type: "feynman"` documents. Uses the existing `TestResult` / `TestScore` models from `app/models/mastery.py` and `app/schemas/scoring.py`, with additional fields (`strong_topics`, `missed_topics`, `improvements`, `status`).

**New collection**: `feynman_hints` — `{ _id, thread_id, concept_name, hint_text, timestamp }`. Collection accessor added to `app/db/mongo.py`.

**Existing message type**: The submission markdown is also saved as a message with `msg_type: "feynman_input"` (already supported in `chat.py` `save_message`) so it appears in conversation history.

## Frontend

### SSE Event Type Extension

Add to the `SSEEvent` union in `lib/api.ts`:

```ts
| { type: "feynman_prompt"; concept_name: string }
```

### State Management

Local component state on the chat page (scoped to the thread, like `interviewQuestions`):

```ts
feynmanOpen: boolean
feynmanConcept: string | null
```

No new context provider needed.

### useChat Hook Additions

- Handle `feynman_prompt` SSE event in the switch statement → set `feynmanOpen: true` + `feynmanConcept`
- `submitFeynman(markdown: string, hintIds: string[])` — calls submit endpoint, resets state
- `requestHint(conceptName: string, currentContent?: string)` — calls hint endpoint, returns `{ hint, hint_id }`

### New Components

- **FeynmanModal** — full-screen overlay with header (concept name + close), BlockNote editor body, submit footer
- **HintBanner** — dismissable banner displayed at top of editor when hint is received

### Editor State

Managed entirely by BlockNote internally. Content only extracted on submit via markdown serialization. No React state sync needed (aside from localStorage draft persistence).

## Component Summary

| Layer | What's new |
|-------|-----------|
| **Frontend** | FeynmanModal component, BlockNote editor, `/hint` slash command, HintBanner, submit flow, toast notification, `feynman_prompt` SSE type |
| **Chat hook** | `feynman_prompt` event handler in switch statement, `submitFeynman()`, `requestHint()` |
| **API** | New `app/api/feynman.py` router: `POST /api/feynman/hint`, `POST /api/feynman/submit` |
| **Agent** | `trigger_feynman` tool setting `agent_ctx.feynman_concept` |
| **SSE loop** | Post-run check for `agent_ctx.feynman_concept` → emit `feynman_prompt` event |
| **Backend** | Hint generation (LLM call + logging), submission storage with status tracking, async scoring job |
| **Database** | Reuse `test_results` collection (`test_type: "feynman"`), new `feynman_hints` collection, collection accessor in `mongo.py` |
| **Models** | Extend `AgentContext` with `feynman_concept: str | None` field |

## Known Limitations (MVP)

- **Scoring durability**: `asyncio.create_task` means scoring is lost if the process restarts. The `status` field allows detection of stuck jobs. A proper task queue (Celery, etc.) is a future improvement.
- **User-initiated entry point**: The button to manually open Feynman mode is a stretch goal. Agent-triggered covers the primary flow.
- **Scorecard delivery**: How the user views their scores is out of scope — a separate section/page will be designed later.
