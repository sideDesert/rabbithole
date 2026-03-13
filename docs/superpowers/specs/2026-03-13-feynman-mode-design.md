# Feynman Mode — Design Spec

## Overview

Feynman mode is a "teach it back" experience where the learner explains a concept in their own words using a Notion-style block editor. It appears as a full-screen modal overlay on the chat page after completing a subsection. An async scoring agent evaluates the explanation in the background and delivers results later.

## Entry Points

Three ways to open Feynman mode, all setting the same state (`feynmanOpen: true`, `feynmanConcept: string`):

1. **Auto-trigger**: After `update_plan_progress` marks a subsection complete, the backend emits a `feynman_prompt` SSE event with the concept name. The frontend opens the modal.
2. **Agent-triggered**: The agent calls a `trigger_feynman` tool that emits the same SSE event.
3. **User-initiated**: A button in the chat UI (near the input or in the plan view next to each concept) opens the modal for the current/selected concept.

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

**Why BlockNote**: Ships drag handles, slash menu, block types, and markdown serialization out of the box. Theming via CSS variables matches the existing shadcn/Tailwind setup. ~30KB gzipped.

## `/hint` Command

**Behavior**: When the learner types `/hint` in the slash menu:
1. Frontend calls `POST /api/feynman/hint` with `{ thread_id, concept_name }` (optionally includes current editor content for smarter hints).
2. Backend makes an LLM call with concept context and returns `{ hint: string }` — a single nudge sentence (e.g., "Consider what happens when a variable goes out of scope").
3. Hint appears as a dismissable banner at the top of the editor.
4. Each hint invocation is logged to MongoDB (`feynman_hints` collection) with `{ thread_id, concept_name, hint_text, timestamp }`.

**Purpose**: Hint usage is signal for the scoring agent — it identifies where the learner struggled and needed help.

## Submit Flow

When the learner clicks "Submit":
1. BlockNote editor content is serialized to markdown.
2. Frontend calls `POST /api/feynman/submit` with `{ thread_id, concept_name, markdown, hints_used: [...] }`.
3. Modal closes.
4. A brief toast notification appears: "Explanation submitted — scoring in progress".
5. Backend returns `202 Accepted` and queues the async scoring workflow.

## Backend

### New SSE Event

```json
{ "type": "feynman_prompt", "concept_name": "Rust Ownership" }
```

Emitted by the agent when it's time to test. Handled by the frontend's `useChat` hook to open the modal.

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/feynman/hint` | POST | Takes `{ thread_id, concept_name }`, makes LLM call, returns `{ hint: string }`, logs hint request |
| `POST /api/feynman/submit` | POST | Takes `{ thread_id, concept_name, markdown, hints_used }`, saves to MongoDB, queues scoring job, returns `202 Accepted` |

### New Agent Tool

`trigger_feynman(concept_name: str)` — emits the `feynman_prompt` SSE event. The agent calls this when a subsection is complete or when it decides to test the learner.

### Scoring Job

The `/submit` endpoint saves the explanation to MongoDB (`feynman_submissions` collection) and kicks off a background task (`asyncio.create_task` for MVP). The scoring agent receives:
- The explanation markdown
- Hint log (which hints were used and when)
- Conversation history for the concept
- The plan's expected coverage (strong topics, weak topics, topics discussed but missed)

Produces a scorecard with:
- Scores on 4 dimensions: clarity, accuracy, depth, transferability (0.0-1.0)
- Identified strong topics
- Identified weak topics
- Topics from conversation that were missed in the explanation
- Areas of improvement

The scorecard is saved to MongoDB. Delivery to the user is via a separate section (TBD, out of scope for this spec).

### New MongoDB Collections

| Collection | Document shape |
|------------|---------------|
| `feynman_submissions` | `{ thread_id, concept_name, markdown, hints_used, score: { clarity, accuracy, depth, transferability }, strong_topics, weak_topics, missed_topics, improvements, created_at, scored_at }` |
| `feynman_hints` | `{ thread_id, concept_name, hint_text, timestamp }` |

## Frontend

### State Management

Local component state on the chat page (scoped to the thread, like `interviewQuestions`):

```ts
feynmanOpen: boolean
feynmanConcept: string | null
```

No new context provider needed.

### useChat Hook Additions

- Handle `feynman_prompt` SSE event → set `feynmanOpen: true` + `feynmanConcept`
- `submitFeynman(markdown: string, hintsUsed: string[])` — calls submit endpoint, resets state
- `requestHint(conceptName: string, currentContent?: string)` — calls hint endpoint, returns hint string

### New Components

- **FeynmanModal** — full-screen overlay with header (concept name + close), BlockNote editor body, submit footer
- **HintBanner** — dismissable banner displayed at top of editor when hint is received

### Editor State

Managed entirely by BlockNote internally. Content only extracted on submit via markdown serialization. No React state sync needed.

## Component Summary

| Layer | What's new |
|-------|-----------|
| **Frontend** | FeynmanModal component, BlockNote editor, `/hint` slash command, HintBanner, submit flow, toast notification |
| **Chat hook** | `feynman_prompt` event handler, `submitFeynman()`, `requestHint()` |
| **API** | `POST /api/feynman/hint`, `POST /api/feynman/submit` |
| **Agent** | `trigger_feynman` tool, `feynman_prompt` SSE event |
| **Backend** | Hint generation (LLM call + logging), submission storage, async scoring job |
| **Database** | `feynman_submissions` collection, `feynman_hints` collection |
