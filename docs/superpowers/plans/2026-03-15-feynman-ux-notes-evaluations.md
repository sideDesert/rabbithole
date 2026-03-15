# Feynman UX, Notes & Evaluations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Feynman modal UX (context, enforced submission, toast-based scoring), add versioned note storage, and create Notes + Evaluations pages.

**Architecture:** Backend gets a `feynman_notes` collection for versioned storage and two new GET endpoints. Frontend decouples scoring polling from the modal into a layout-level hook with toast notifications. Two new top-level pages (`/notes`, `/evaluations`) plus topic-detail integration share common components.

**Tech Stack:** Python/FastAPI, MongoDB, Next.js, React, Tailwind, sonner (toast), react-query

---

## File Structure

### Backend (modify)
- `backend/app/db/mongo.py` — add `feynman_notes()` collection accessor
- `backend/app/db/indexes.py` — add index on `feynman_notes`
- `backend/app/api/feynman.py` — add note storage in submit, add notes + evaluations endpoints

### Frontend (modify)
- `client/components/feynman-modal.tsx` — header context, dismissable prop, submit-and-close flow
- `client/app/threads/[threadId]/page.tsx` — pass dismissable=false, wire polling hook
- `client/components/providers.tsx` — wrap with FeynmanPollingProvider
- `client/components/app-sidebar.tsx` — add Notes and Evaluations nav items
- `client/app/study-plans/topic-detail.tsx` — add notes per concept
- `client/lib/api.ts` — add API functions for notes and evaluations endpoints

### Frontend (create)
- `client/hooks/use-feynman-polling.tsx` — polling hook + context provider
- `client/app/notes/page.tsx` — top-level notes page
- `client/app/evaluations/page.tsx` — top-level evaluations page
- `client/components/note-version-list.tsx` — shared component for versioned note list
- `client/components/evaluation-detail.tsx` — shared component for evaluation breakdown

---

## Chunk 1: Backend — Versioned notes storage + endpoints

### Task 1: Add `feynman_notes` collection accessor and index

**Files:**
- Modify: `backend/app/db/mongo.py`
- Modify: `backend/app/db/indexes.py`

- [ ] **Step 1: Add collection accessor**

In `backend/app/db/mongo.py`, add after the `feynman_hints()` accessor:

```python
def feynman_notes() -> Collection[dict[str, Any]]:
    return get_db()["feynman_notes"]
```

- [ ] **Step 2: Add index**

In `backend/app/db/indexes.py`, add the import:

```python
from app.db.mongo import (
    # ... existing imports ...
    feynman_notes,
)
```

Add at the end of `ensure_indexes()`:

```python
    # feynman_notes
    _ = feynman_notes().create_index(
        [("user_id", ASCENDING), ("topic_slug", ASCENDING), ("concept_name", ASCENDING), ("version", ASCENDING)]
    )
```

- [ ] **Step 3: Verify backend starts**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.db.mongo import feynman_notes; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/db/mongo.py backend/app/db/indexes.py
git commit -m "feat: add feynman_notes collection and index"
```

### Task 2: Store versioned notes in submit endpoint

**Files:**
- Modify: `backend/app/api/feynman.py:196-247`

- [ ] **Step 1: Add note storage to submit endpoint**

In `backend/app/api/feynman.py`, add import at the top:

```python
from app.db.mongo import feynman_notes
```

In `submit_explanation`, after `submission_id = str(result.inserted_id)` (line 225) and before the `save_message` block (line 228), add:

```python
    # Store versioned Feynman note
    topic_slug = str(thread.get("topic_slug", ""))
    existing_count = feynman_notes().count_documents({
        "user_id": thread["user_id"],
        "topic_slug": topic_slug,
        "concept_name": req.concept_name,
    })
    feynman_notes().insert_one({
        "user_id": thread["user_id"],
        "topic_slug": topic_slug,
        "concept_name": req.concept_name,
        "version": existing_count + 1,
        "markdown": req.markdown,
        "submission_id": submission_id,
        "created_at": datetime.now(timezone.utc),
    })
```

- [ ] **Step 2: Verify endpoint loads**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.feynman import router; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/feynman.py
git commit -m "feat: store versioned Feynman notes on submit"
```

### Task 3: Add notes and evaluations GET endpoints

**Files:**
- Modify: `backend/app/api/feynman.py`

- [ ] **Step 1: Add notes endpoint**

Add after the `get_feynman_result` endpoint:

```python
@router.get("/notes")
async def get_notes(topic_slug: str, concept_name: str | None = None):
    """Get versioned Feynman notes for a topic, optionally filtered by concept."""
    query: dict[str, object] = {"topic_slug": topic_slug}
    if concept_name:
        query["concept_name"] = concept_name

    docs = list(feynman_notes().find(query, sort=[("concept_name", 1), ("version", -1)]))

    notes = []
    for doc in docs:
        # Look up the associated evaluation score
        evaluation = None
        if doc.get("submission_id"):
            result_doc = mongo.test_results().find_one({"_id": ObjectId(doc["submission_id"])})
            if result_doc and result_doc.get("status") == "scored":
                evaluation = {
                    "overall_score": result_doc.get("overall_score", 0.0),
                    "scores": result_doc.get("scores"),
                    "feedback": result_doc.get("feedback", ""),
                }

        notes.append({
            "id": str(doc["_id"]),
            "concept_name": doc["concept_name"],
            "version": doc["version"],
            "markdown": doc["markdown"],
            "submission_id": doc.get("submission_id"),
            "created_at": doc["created_at"].isoformat(),
            "evaluation": evaluation,
        })

    return {"notes": notes}
```

- [ ] **Step 2: Add evaluations endpoint**

Add after the notes endpoint:

```python
@router.get("/evaluations")
async def get_evaluations(topic_slug: str | None = None):
    """Get all scored evaluations, optionally filtered by topic."""
    query: dict[str, object] = {"status": "scored", "test_type": "feynman"}
    if topic_slug:
        # Find all thread_ids for this topic
        thread_ids = [
            t["_id"] for t in mongo.threads().find(
                {"topic_slug": topic_slug},
                {"_id": 1},
            )
        ]
        query["thread_id"] = {"$in": thread_ids}

    docs = list(mongo.test_results().find(query, sort=[("created_at", -1)]))

    evaluations = []
    for doc in docs:
        # Look up topic_slug from thread
        thread = mongo.threads().find_one({"_id": doc.get("thread_id")})
        evaluations.append({
            "id": str(doc["_id"]),
            "concept_name": doc.get("concept_id", ""),
            "topic_slug": str(thread.get("topic_slug", "")) if thread else "",
            "overall_score": doc.get("overall_score", 0.0),
            "scores": doc.get("scores"),
            "feedback": doc.get("feedback", ""),
            "strong_topics": doc.get("strong_topics", []),
            "weak_areas": doc.get("weak_areas", []),
            "missed_topics": doc.get("missed_topics", []),
            "improvements": doc.get("improvements", []),
            "mastery_update": doc.get("mastery_update"),
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else "",
        })

    return {"evaluations": evaluations}
```

- [ ] **Step 3: Verify endpoints load**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.feynman import router; print([r.path for r in router.routes])"`
Expected: list including `/api/feynman/notes` and `/api/feynman/evaluations`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/feynman.py
git commit -m "feat: add GET endpoints for Feynman notes and evaluations"
```

### Task 4: Add error logging to scoring background task

**Files:**
- Modify: `backend/app/api/feynman.py:101-191`

- [ ] **Step 1: Add logger and fix silent exception handling**

At the top of `feynman.py`, add:

```python
import logging

logger = logging.getLogger(__name__)
```

Replace the `except Exception:` block (line 187-191) with:

```python
    except Exception as e:
        logger.error("[feynman] scoring failed for submission %s: %s", submission_id, e, exc_info=True)
        mongo.test_results().update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {"status": "failed"}},
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/feynman.py
git commit -m "fix: add error logging to Feynman scoring background task"
```

---

## Chunk 2: Frontend — Toast setup + polling hook + API client

### Task 5: Install sonner and add Toaster to providers

**Files:**
- Modify: `client/components/providers.tsx`

- [ ] **Step 1: Install sonner**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm add sonner`

- [ ] **Step 2: Add Toaster component to providers**

In `client/components/providers.tsx`, add import:

```typescript
import { Toaster } from "sonner";
```

Add `<Toaster richColors position="bottom-right" />` as the last child inside the `<Providers>` return, right before the closing `</QueryClientProvider>`:

```typescript
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <SidebarProvider>
          <AgentProvider>
            <PlanProvider>
              {children}
            </PlanProvider>
          </AgentProvider>
        </SidebarProvider>
      </ThemeProvider>
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/components/providers.tsx client/package.json client/pnpm-lock.yaml
git commit -m "feat: install sonner and add Toaster to providers"
```

### Task 6: Add API functions for notes and evaluations

**Files:**
- Modify: `client/lib/api.ts`

- [ ] **Step 1: Add types and fetch functions**

Add after the `getFeynmanResult` function:

```typescript
export interface FeynmanNote {
  id: string;
  concept_name: string;
  version: number;
  markdown: string;
  submission_id: string | null;
  created_at: string;
  evaluation: {
    overall_score: number;
    scores: { clarity: number; accuracy: number; depth: number; transferability: number } | null;
    feedback: string;
  } | null;
}

export async function getFeynmanNotes(
  topicSlug: string,
  conceptName?: string,
): Promise<{ notes: FeynmanNote[] }> {
  const params = new URLSearchParams({ topic_slug: topicSlug });
  if (conceptName) params.set("concept_name", conceptName);
  const res = await fetch(`${API_BASE}/feynman/notes?${params}`);
  if (!res.ok) throw new Error("Failed to get notes");
  return res.json();
}

export interface Evaluation {
  id: string;
  concept_name: string;
  topic_slug: string;
  overall_score: number;
  scores: { clarity: number; accuracy: number; depth: number; transferability: number } | null;
  feedback: string;
  strong_topics: string[];
  weak_areas: string[];
  missed_topics: string[];
  improvements: string[];
  mastery_update: {
    previous_score: number;
    new_score: number;
    tier: string;
    next_review: string;
  } | null;
  created_at: string;
}

export async function getEvaluations(
  topicSlug?: string,
): Promise<{ evaluations: Evaluation[] }> {
  const params = new URLSearchParams();
  if (topicSlug) params.set("topic_slug", topicSlug);
  const res = await fetch(`${API_BASE}/feynman/evaluations?${params}`);
  if (!res.ok) throw new Error("Failed to get evaluations");
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/lib/api.ts
git commit -m "feat: add API client for Feynman notes and evaluations"
```

### Task 7: Create `useFeynmanPolling` hook with context provider

**Files:**
- Create: `client/hooks/use-feynman-polling.tsx`

- [ ] **Step 1: Create the hook and provider**

```typescript
"use client";

import { createContext, useContext, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getFeynmanResult } from "@/lib/api";

interface FeynmanPollingCtx {
  startPolling: (submissionId: string, conceptName: string) => void;
}

const Ctx = createContext<FeynmanPollingCtx>({
  startPolling: () => {},
});

export function FeynmanPollingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const activePolls = useRef(new Set<string>());

  const startPolling = useCallback(
    (submissionId: string, conceptName: string) => {
      if (activePolls.current.has(submissionId)) return;
      activePolls.current.add(submissionId);

      const poll = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const result = await getFeynmanResult(submissionId);
            if (result.status === "scored") {
              toast.success(`Evaluation complete for ${conceptName}`);
              queryClient.invalidateQueries({ queryKey: ["feynman-notes"] });
              queryClient.invalidateQueries({ queryKey: ["evaluations"] });
              activePolls.current.delete(submissionId);
              return;
            }
            if (result.status === "failed") {
              toast.error(`Evaluation failed for ${conceptName}`);
              activePolls.current.delete(submissionId);
              return;
            }
          } catch {
            // Network error — keep polling
          }
        }
        toast.error(`Evaluation timed out for ${conceptName}`);
        activePolls.current.delete(submissionId);
      };

      poll();
    },
    [queryClient],
  );

  return <Ctx value={{ startPolling }}>{children}</Ctx>;
}

export function useFeynmanPolling() {
  return useContext(Ctx);
}
```

- [ ] **Step 2: Wire provider into providers.tsx**

In `client/components/providers.tsx`, add import:

```typescript
import { FeynmanPollingProvider } from "@/hooks/use-feynman-polling";
```

Wrap children with it inside PlanProvider:

```typescript
<PlanProvider>
  <FeynmanPollingProvider>
    {children}
  </FeynmanPollingProvider>
</PlanProvider>
```

- [ ] **Step 3: Commit**

```bash
git add client/hooks/use-feynman-polling.tsx client/components/providers.tsx
git commit -m "feat: add FeynmanPollingProvider for toast-based scoring notifications"
```

---

## Chunk 3: Frontend — Feynman modal UX changes

### Task 8: Update Feynman modal with context, dismissable prop, and submit-and-close

**Files:**
- Modify: `client/components/feynman-modal.tsx`

- [ ] **Step 1: Add `dismissable` prop and update header**

Change the interface:

```typescript
interface FeynmanModalProps {
  threadId: string;
  conceptName: string;
  onClose: () => void;
  onSubmitComplete?: (submissionId: string) => void;
  dismissable?: boolean;
}
```

Update the component signature:

```typescript
export function FeynmanModal({
  threadId,
  conceptName,
  onClose,
  onSubmitComplete,
  dismissable = true,
}: FeynmanModalProps) {
```

- [ ] **Step 2: Remove close button and backdrop click when not dismissable**

Replace the header close button with:

```tsx
{dismissable && (
  <button
    onClick={handleClose}
    className="rounded-lg p-2 hover:bg-accent"
  >
    <CloseCircleBoldDuotone className="h-5 w-5" />
  </button>
)}
```

Replace the backdrop `onClick`:

```tsx
<div
  className={`fixed inset-0 z-99 bg-background/70 backdrop-blur-sm transition-opacity duration-300 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
  onClick={dismissable ? handleClose : undefined}
/>
```

- [ ] **Step 3: Add instructional text to header**

In the header div, after the `<h1>` tag, add:

```tsx
<p className="mt-1 text-sm text-muted-foreground">
  Explain this concept in your own words as if teaching it to someone new. The clearer your explanation, the better you understand it.
</p>
```

- [ ] **Step 4: Change submit flow — close immediately, delegate polling**

Remove the `feynmanResult` state, the `FeynmanResults` import, the `getFeynmanResult` import, and the polling logic from `handleSubmit`.

Add import:

```typescript
import { toast } from "sonner";
```

Replace `handleSubmit` with:

```typescript
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      const hintIds = hints.map((h) => h.id);
      const { submission_id } = await submitFeynmanExplanation(
        threadId,
        conceptName,
        markdown,
        hintIds,
      );
      localStorage.removeItem(DRAFT_KEY(threadId, conceptName));
      toast.info(`Evaluation started for ${conceptName}`);
      onSubmitComplete?.(submission_id);
      animateOut(onClose);
    } catch {
      toast.error("Failed to submit explanation");
      setIsSubmitting(false);
    }
  }, [editor, threadId, conceptName, hints, onClose, animateOut, onSubmitComplete]);
```

- [ ] **Step 5: Remove the results view from the JSX**

Remove the `feynmanResult` conditional block. The modal body should only contain the editor and footer (no results view). Remove the `FeynmanResults` import and the `feynman-results.tsx` usage from this file.

The JSX after hints should just be:

```tsx
{/* Editor */}
<div className="flex-1 min-h-0 px-6 py-4 overflow-auto">
  <BlockNoteView
    className="bg-transparent"
    editor={editor}
    theme={resolvedTheme === "dark" ? "dark" : "light"}
    data-feynman-editor
  />
</div>

{/* Footer */}
<div className="flex items-center justify-between border-t border-border px-6 py-4">
  <Button
    variant="outline"
    size="sm"
    onClick={handleHint}
    disabled={isHintLoading}
  >
    {isHintLoading ? "Getting hint..." : "Hint"}
  </Button>
  <Button onClick={handleSubmit} disabled={isSubmitting}>
    {isSubmitting ? "Submitting..." : "Submit Explanation"}
  </Button>
</div>
```

- [ ] **Step 6: Update `handleClose` to skip confirmation when not dismissable**

```typescript
const handleClose = useCallback(() => {
  if (!dismissable) return;
  if (hasContentRef.current) {
    if (!window.confirm("Discard your explanation?")) return;
  }
  animateOut(onClose);
}, [dismissable, onClose, animateOut]);
```

- [ ] **Step 7: Commit**

```bash
git add client/components/feynman-modal.tsx
git commit -m "feat: update Feynman modal with context, dismissable prop, and submit-and-close flow"
```

### Task 9: Wire polling hook in thread page

**Files:**
- Modify: `client/app/threads/[threadId]/page.tsx`

- [ ] **Step 1: Import and use the polling hook**

Add import:

```typescript
import { useFeynmanPolling } from "@/hooks/use-feynman-polling";
```

Inside the component, add:

```typescript
const { startPolling } = useFeynmanPolling();
```

- [ ] **Step 2: Update FeynmanModal usage**

Change the FeynmanModal rendering to:

```tsx
{feynmanOpen && feynmanConcept && (
  <FeynmanModal
    threadId={threadId}
    conceptName={feynmanConcept}
    dismissable={false}
    onClose={() => {
      dismissFeynman();
      if (!phaseComplete) {
        send("Move to next concept");
      }
    }}
    onSubmitComplete={(submissionId) => {
      startPolling(submissionId, feynmanConcept);
    }}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add "client/app/threads/[threadId]/page.tsx"
git commit -m "feat: wire FeynmanPollingProvider in thread page, pass dismissable=false"
```

---

## Chunk 4: Frontend — Shared components

### Task 10: Create evaluation detail component

**Files:**
- Create: `client/components/evaluation-detail.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { Evaluation } from "@/lib/api";

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium w-10 text-right">{pct}%</span>
    </div>
  );
}

export function EvaluationDetail({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{evaluation.concept_name}</h3>
          <p className="text-xs text-muted-foreground">
            {new Date(evaluation.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className="text-2xl font-bold">
          {Math.round(evaluation.overall_score * 100)}%
        </span>
      </div>

      {evaluation.scores && (
        <div className="space-y-2">
          <ScoreBar label="Clarity" score={evaluation.scores.clarity} />
          <ScoreBar label="Accuracy" score={evaluation.scores.accuracy} />
          <ScoreBar label="Depth" score={evaluation.scores.depth} />
          <ScoreBar label="Transferability" score={evaluation.scores.transferability} />
        </div>
      )}

      {evaluation.feedback && (
        <p className="text-sm text-muted-foreground">{evaluation.feedback}</p>
      )}

      {evaluation.weak_areas.length > 0 && (
        <div className="text-sm">
          <span className="font-medium">Areas to improve: </span>
          {evaluation.weak_areas.join(", ")}
        </div>
      )}

      {evaluation.improvements.length > 0 && (
        <div className="text-sm">
          <span className="font-medium">Suggestions: </span>
          <ul className="list-disc list-inside mt-1">
            {evaluation.improvements.map((imp, i) => (
              <li key={i} className="text-muted-foreground">{imp}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.mastery_update && (
        <div className="text-xs text-muted-foreground border-t pt-2">
          Mastery: {Math.round(evaluation.mastery_update.previous_score * 100)}% →{" "}
          {Math.round(evaluation.mastery_update.new_score * 100)}% ({evaluation.mastery_update.tier})
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/components/evaluation-detail.tsx
git commit -m "feat: add EvaluationDetail shared component"
```

### Task 11: Create note version list component

**Files:**
- Create: `client/components/note-version-list.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import type { FeynmanNote } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NoteVersionListProps {
  notes: FeynmanNote[];
}

export function NoteVersionList({ notes }: NoteVersionListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">No notes yet.</p>;
  }

  return (
    <div className="space-y-2">
      {notes.map((note) => {
        const isExpanded = expandedId === note.id;
        const score = note.evaluation?.overall_score;

        return (
          <div key={note.id} className="border border-border rounded-lg">
            <button
              onClick={() => setExpandedId(isExpanded ? null : note.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent/50 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  v{note.version}
                </span>
                <span className="text-sm truncate max-w-[200px]">
                  {note.markdown.slice(0, 80)}
                  {note.markdown.length > 80 ? "..." : ""}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {score != null && (
                  <span className={cn(
                    "text-xs font-medium",
                    score >= 0.7 ? "text-emerald-500" : score >= 0.4 ? "text-amber-500" : "text-red-500",
                  )}>
                    {Math.round(score * 100)}%
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(note.created_at).toLocaleDateString()}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-border">
                <div className="prose prose-sm dark:prose-invert max-w-none pt-2 whitespace-pre-wrap">
                  {note.markdown}
                </div>
                {note.evaluation && (
                  <div className="mt-3 pt-2 border-t border-border/50 space-y-1">
                    {note.evaluation.scores && (
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Clarity: {Math.round(note.evaluation.scores.clarity * 100)}%</span>
                        <span>Accuracy: {Math.round(note.evaluation.scores.accuracy * 100)}%</span>
                        <span>Depth: {Math.round(note.evaluation.scores.depth * 100)}%</span>
                        <span>Transfer: {Math.round(note.evaluation.scores.transferability * 100)}%</span>
                      </div>
                    )}
                    {note.evaluation.feedback && (
                      <p className="text-xs text-muted-foreground">{note.evaluation.feedback}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/components/note-version-list.tsx
git commit -m "feat: add NoteVersionList shared component"
```

---

## Chunk 5: Frontend — Top-level pages + sidebar + topic detail integration

### Task 12: Add sidebar entries for Notes and Evaluations

**Files:**
- Modify: `client/app/layout.tsx`
- Modify: `client/components/app-sidebar.tsx`

- [ ] **Step 1: Add tools to layout.tsx**

In the `tools` array in `client/app/layout.tsx`, add two entries. Import the icons:

```typescript
import { AtomBoldDuotone, Widget2BoldDuotone, GraphBoldDuotone, Pen2BoldDuotone, DocumentTextBoldDuotone, ChecklistBoldDuotone } from "solar-icon-set";
```

Add to the tools array:

```typescript
const tools: Tool[] = [
  { name: "Dashboard", icon: Widget2BoldDuotone, href: "/dashboard" },
  { name: "Study Plans", icon: Pen2BoldDuotone, href: "/study-plans" },
  { name: "Notes", icon: DocumentTextBoldDuotone, href: "/notes" },
  { name: "Evaluations", icon: ChecklistBoldDuotone, href: "/evaluations" },
  { name: "Knowledge Graph", icon: GraphBoldDuotone, href: "/knowledge-graph" },
  { name: "Memory Graph", icon: AtomBoldDuotone, href: "/memory-graph" },
];
```

- [ ] **Step 2: Commit**

```bash
git add client/app/layout.tsx
git commit -m "feat: add Notes and Evaluations to sidebar navigation"
```

### Task 13: Create Notes page

**Files:**
- Create: `client/app/notes/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFeynmanNotes, type FeynmanNote } from "@/lib/api";
import { NoteVersionList } from "@/components/note-version-list";
import { Skeleton } from "@/components/ui/skeleton";

// We need all notes across topics — get unique topic slugs from study topics
import { useStudyTopics } from "@/hooks/use-study-topics";

export default function NotesPage() {
  const { topics, isLoading: topicsLoading } = useStudyTopics();
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Feynman Notes</h1>

      {topicsLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!topicsLoading && topics.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No study topics yet. Complete some Feynman exercises to see your notes here.
        </p>
      )}

      {!topicsLoading && topics.length > 0 && (
        <div className="space-y-3">
          {topics.map((topic) => (
            <TopicNotesGroup
              key={topic.topic_slug}
              topicSlug={topic.topic_slug}
              topicName={topic.topic}
              isExpanded={expandedTopic === topic.topic_slug}
              onToggle={() =>
                setExpandedTopic(
                  expandedTopic === topic.topic_slug ? null : topic.topic_slug,
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TopicNotesGroup({
  topicSlug,
  topicName,
  isExpanded,
  onToggle,
}: {
  topicSlug: string;
  topicName: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["feynman-notes", topicSlug],
    queryFn: () => getFeynmanNotes(topicSlug),
    enabled: isExpanded,
  });

  const notes = data?.notes ?? [];

  // Group notes by concept
  const byConceptMap = new Map<string, FeynmanNote[]>();
  for (const note of notes) {
    const existing = byConceptMap.get(note.concept_name) ?? [];
    existing.push(note);
    byConceptMap.set(note.concept_name, existing);
  }
  const byConcept = Array.from(byConceptMap.entries());

  return (
    <div className="border border-border rounded-lg">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/50 rounded-lg transition-colors"
      >
        <span className="font-medium">{topicName}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {isLoading && <Skeleton className="h-8 w-full" />}
          {!isLoading && byConcept.length === 0 && (
            <p className="text-sm text-muted-foreground">No notes for this topic.</p>
          )}
          {byConcept.map(([concept, conceptNotes]) => (
            <div key={concept}>
              <h3 className="text-sm font-medium mb-2">{concept}</h3>
              <NoteVersionList notes={conceptNotes} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/app/notes/page.tsx
git commit -m "feat: add top-level Notes page"
```

### Task 14: Create Evaluations page

**Files:**
- Create: `client/app/evaluations/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEvaluations, type Evaluation } from "@/lib/api";
import { EvaluationDetail } from "@/components/evaluation-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function EvaluationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["evaluations"],
    queryFn: () => getEvaluations(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const evaluations = data?.evaluations ?? [];
  const selected = evaluations.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Evaluations</h1>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && evaluations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No evaluations yet. Complete a Feynman exercise to see your results here.
        </p>
      )}

      {!isLoading && evaluations.length > 0 && !selected && (
        <div className="space-y-2">
          {evaluations.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setSelectedId(ev.id)}
              className="w-full flex items-center justify-between px-4 py-3 border border-border rounded-lg hover:bg-accent/50 transition-colors text-left"
            >
              <div>
                <span className="font-medium">{ev.concept_name}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {ev.topic_slug.replace(/-/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-sm font-medium",
                  ev.overall_score >= 0.7 ? "text-emerald-500" : ev.overall_score >= 0.4 ? "text-amber-500" : "text-red-500",
                )}>
                  {Math.round(ev.overall_score * 100)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(ev.created_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div>
          <button
            onClick={() => setSelectedId(null)}
            className="text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            ← Back to all evaluations
          </button>
          <div className="border border-border rounded-lg p-4">
            <EvaluationDetail evaluation={selected} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/app/evaluations/page.tsx
git commit -m "feat: add top-level Evaluations page"
```

### Task 15: Add notes to topic detail page

**Files:**
- Modify: `client/app/study-plans/topic-detail.tsx`

- [ ] **Step 1: Add notes query and display per concept**

Add imports at the top:

```typescript
import { getFeynmanNotes, type FeynmanNote } from "@/lib/api";
import { NoteVersionList } from "@/components/note-version-list";
```

Inside the component, add a query for notes:

```typescript
const { data: notesData } = useQuery({
  queryKey: ["feynman-notes", topic.topic_slug],
  queryFn: () => getFeynmanNotes(topic.topic_slug),
});

const notesByConcept = new Map<string, FeynmanNote[]>();
for (const note of notesData?.notes ?? []) {
  const existing = notesByConcept.get(note.concept_name) ?? [];
  existing.push(note);
  notesByConcept.set(note.concept_name, existing);
}
```

- [ ] **Step 2: Add note count badge and expandable notes per concept**

In the concept list rendering, after each concept's name/checkbox row, add:

```tsx
{(() => {
  const conceptNotes = notesByConcept.get(concept.name) ?? [];
  if (conceptNotes.length === 0) return null;
  return (
    <div className="ml-6 mt-1">
      <span className="text-xs text-muted-foreground">
        {conceptNotes.length} note{conceptNotes.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
})()}
```

Find the exact JSX location by reading the concept rendering in topic-detail.tsx and placing the notes badge after the concept name span.

- [ ] **Step 3: Commit**

```bash
git add client/app/study-plans/topic-detail.tsx
git commit -m "feat: show Feynman notes per concept in topic detail"
```

### Task 16: Verify build

- [ ] **Step 1: Run build**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build`

Fix any type errors.

- [ ] **Step 2: Start backend and frontend**

Run backend: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run uvicorn main:app --reload --port 8000`
Run frontend: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm dev`

- [ ] **Step 3: Manual test**

1. Navigate to a teaching thread, trigger Feynman mode
2. Verify: no close button, instructional text visible
3. Write explanation, click Submit
4. Verify: modal closes, toast "Evaluation started" appears
5. Wait for scoring → verify toast "Evaluation complete" appears
6. Navigate to `/notes` → verify notes appear
7. Navigate to `/evaluations` → verify evaluation appears
8. Navigate to study plan topic detail → verify note count badge per concept
