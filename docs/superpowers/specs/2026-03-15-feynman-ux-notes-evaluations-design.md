# Feynman Mode UX, Notes & Evaluations

## Goal

Improve the Feynman mode experience: add context, enforce submission, decouple scoring from the modal. Add versioned note storage and two new views (topic-level and top-level) for notes and evaluations.

---

## 1. Feynman Modal Changes

### Header context
Add instructional text below the concept name:
> "Explain this concept in your own words as if teaching it to someone new. The clearer your explanation, the better you understand it."

### Dismissability
New `dismissable` prop on `FeynmanModal`:
- `dismissable=false` (SSE-triggered): no X button, no backdrop click dismiss, no discard confirmation. Only way out is Submit.
- `dismissable=true` (manual open from study plan): X button and backdrop click work as today.

### Submit flow
On submit:
1. Close the modal immediately (animate out).
2. Show toast: "Evaluation started for {conceptName}."
3. Polling moves to a new `useFeynmanPolling` hook at layout level.
4. When scoring completes, show toast: "Evaluation complete for {conceptName}" with optional link to results.
5. On failure, show toast: "Evaluation failed for {conceptName}."

---

## 2. Backend — Versioned Feynman Notes

### New collection: `feynman_notes`

```
{
  _id: ObjectId,
  user_id: str,
  topic_slug: str,
  concept_name: str,
  version: int,           // auto-incremented per user+topic+concept
  markdown: str,           // the user's explanation
  submission_id: str,      // links to test_results._id
  created_at: datetime
}
```

### Storage logic
In the existing `POST /api/feynman/submit` endpoint, after saving the test_result and before kicking off the background scoring task:
1. Count existing notes for this user + topic_slug + concept_name.
2. Insert a new `feynman_notes` document with `version = count + 1`.

Requires looking up `topic_slug` from the thread document (already fetched).

### New endpoints

**`GET /api/feynman/notes`**
Query params: `topic_slug` (required), `concept_name` (optional)
- If `concept_name` provided: returns all versions for that concept, sorted by version desc.
- If only `topic_slug`: returns all notes for the topic, grouped by concept.

**`GET /api/feynman/evaluations`**
Query params: `topic_slug` (optional)
- If `topic_slug` provided: returns all scored test_results for that topic.
- If omitted: returns all scored test_results for user (for top-level evaluations page).
- Only returns documents with `status: "scored"`.
- Sorted by `created_at` desc.

---

## 3. Frontend — Topic Detail Integration

On the study plan topic detail page (`/study-plans` topic detail), for each concept:
- Show note count badge (e.g. "3 notes") if notes exist.
- Click to expand: chronological list of versions (most recent first).
- Each version row: version number, timestamp, associated evaluation score (fetched from linked submission_id), truncated preview of markdown.
- Click a version to see the full note text and evaluation breakdown (4 dimension scores, feedback, mastery update).

---

## 4. Frontend — Top-Level Pages

### `/notes` page
- Lists all topics that have Feynman notes (grouped by topic).
- Click a topic to expand concepts with their versioned notes.
- Same note list component as topic detail (shared component).

### `/evaluations` page
- Lists all completed evaluations across all topics.
- Each row: concept name, topic name, overall score, date.
- Click a row to see full breakdown: 4 dimension scores, feedback, strong topics, weak areas, improvements, mastery update.

### Sidebar entries
Add "Notes" and "Evaluations" to the app sidebar navigation.

---

## 5. Evaluation Polling Hook

### `useFeynmanPolling` hook
- Lives at layout level (provider in `app/layout.tsx`).
- Exposes `startPolling(submissionId: string, conceptName: string)`.
- Polls `GET /api/feynman/result/{submissionId}` every 2 seconds, up to 30 attempts.
- On `status === "scored"`: shows success toast, invalidates relevant queries.
- On `status === "failed"` or timeout: shows error toast.
- Persists active polls in state so they survive page navigation within the app.

---

## 6. Data Flow

```
[User writes explanation in BlockNote editor]
  ↓
[Submit clicked]
  → POST /api/feynman/submit
  → Saves test_result (status: "scoring")
  → Saves feynman_note (versioned)
  → Saves message to conversation
  → Kicks off background scoring task
  → Returns submission_id
  ↓
[Modal closes immediately]
[Toast: "Evaluation started"]
[useFeynmanPolling begins polling]
  ↓
[Background task scores via LLM]
  → Updates test_result with scores + mastery
  ↓
[Polling detects status: "scored"]
[Toast: "Evaluation complete"]
[Query cache invalidated for notes/evaluations]
```

---

## Files to modify

### Backend
- `backend/app/api/feynman.py` — add note storage in submit, add notes + evaluations endpoints
- `backend/app/db/mongo.py` — add `feynman_notes()` collection accessor
- `backend/app/db/indexes.py` — add index on `feynman_notes` (user_id, topic_slug, concept_name)

### Frontend (modify)
- `client/components/feynman-modal.tsx` — header context, dismissable prop, submit-and-close flow
- `client/app/threads/[threadId]/page.tsx` — pass dismissable=false, wire useFeynmanPolling
- `client/app/layout.tsx` — wrap with FeynmanPollingProvider, add sidebar entries
- `client/components/app-sidebar.tsx` — add Notes and Evaluations nav items
- `client/app/study-plans/topic-detail.tsx` — add notes per concept
- `client/lib/api.ts` — add API functions for notes and evaluations endpoints

### Frontend (create)
- `client/hooks/use-feynman-polling.tsx` — polling hook + context provider
- `client/app/notes/page.tsx` — top-level notes page
- `client/app/evaluations/page.tsx` — top-level evaluations page
- `client/components/note-version-list.tsx` — shared component for versioned note list
- `client/components/evaluation-detail.tsx` — shared component for evaluation breakdown
