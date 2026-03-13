# Feynman Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "teach it back" Feynman mode — a full-screen modal with a Notion-style block editor where learners explain concepts, with `/hint` support and async background scoring.

**Architecture:** Agent tool `trigger_feynman` sets context → SSE loop emits `feynman_prompt` → frontend opens full-screen modal with BlockNote editor → user writes explanation → submit calls new `/api/feynman/submit` endpoint → async scoring job runs in background. Follows the existing `present_interview` → `interview_questions` pattern exactly.

**Tech Stack:** BlockNote (React Notion-clone editor), FastAPI (new feynman router), OpenAI Agents SDK (`@function_tool`), MongoDB, asyncio background tasks.

**Spec:** `docs/superpowers/specs/2026-03-13-feynman-mode-design.md`

---

## Chunk 1: Backend — Database, Models & Tool

### Task 1: Add `feynman_hints` collection accessor to MongoDB

**Files:**
- Modify: `backend/app/db/mongo.py:49-54` (add after `learning_sessions()`)

- [ ] **Step 1: Add the collection accessor**

In `backend/app/db/mongo.py`, add after the `learning_sessions()` function (line 54):

```python
def feynman_hints() -> Collection[dict[str, Any]]:
    return get_db()["feynman_hints"]
```

- [ ] **Step 2: Verify no import errors**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.db import mongo; print(mongo.feynman_hints())"`
Expected: `Collection(Database(...), 'feynman_hints')`

- [ ] **Step 3: Commit**

```bash
git add backend/app/db/mongo.py
git commit -m "feat: add feynman_hints collection accessor"
```

---

### Task 2: Extend `AgentContext` with `feynman_concept` field

**Files:**
- Modify: `backend/app/tools_impl.py:21-30` (AgentContext dataclass)

- [ ] **Step 1: Add the field to AgentContext**

In `backend/app/tools_impl.py`, add a new field to the `AgentContext` dataclass after `interview_questions` (line 29):

```python
feynman_concept: str | None = None
```

The full dataclass becomes:
```python
@dataclass
class AgentContext:
    """Passed to every tool via RunContextWrapper."""
    user_id: str
    thread_id: str
    topic_slug: str
    group_id: str
    interview_questions: list[dict[str, Any]] | None = None
    feynman_concept: str | None = None
```

- [ ] **Step 2: Verify no import errors**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.tools_impl import AgentContext; ctx = AgentContext('u','t','s','g'); print(ctx.feynman_concept)"`
Expected: `None`

- [ ] **Step 3: Commit**

```bash
git add backend/app/tools_impl.py
git commit -m "feat: add feynman_concept field to AgentContext"
```

---

### Task 3: Add `trigger_feynman` tool

**Files:**
- Modify: `backend/app/tools_impl.py` (add new tool function after `update_plan_progress`, around line 275)
- Modify: `backend/app/agent_core.py:37-47` (add to teaching phase tools)

- [ ] **Step 1: Write the `trigger_feynman` tool**

In `backend/app/tools_impl.py`, add after the last tool function:

```python
@function_tool
async def trigger_feynman(
    ctx: RunContextWrapper[AgentContext],
    concept_name: str,
) -> str:
    """Trigger Feynman mode for a concept. Opens a writing interface where the learner
    explains the concept in their own words. Call this after finishing a subsection
    to test the learner's understanding."""
    ctx.context.feynman_concept = concept_name
    return f"Feynman mode triggered for '{concept_name}'. The learner will now write their explanation."
```

- [ ] **Step 2: Add `trigger_feynman` to teaching phase tools**

In `backend/app/agent_core.py`, update the `PHASE_TOOLS` dict. The `"teaching"` list (currently line ~45) should include `trigger_feynman`:

```python
"teaching": [recall_memory, store_memory, suggest_branches, read_plan, update_plan_progress, trigger_feynman],
```

Also add the import at the top of `agent_core.py`:
```python
from app.tools_impl import (
    ...,
    trigger_feynman,
)
```

- [ ] **Step 3: Verify import chain works**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.agent_core import build_agent; a = build_agent(phase='teaching'); print([t.name for t in a.tools])"`
Expected: List includes `"trigger_feynman"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/tools_impl.py backend/app/agent_core.py
git commit -m "feat: add trigger_feynman tool to teaching phase"
```

---

### Task 4: Emit `feynman_prompt` SSE event in post-run loop

**Files:**
- Modify: `backend/app/api/chat.py:783-799` (add after interview_questions check)

- [ ] **Step 1: Add feynman_prompt emission**

In `backend/app/api/chat.py`, find the post-run block that checks `agent_ctx.interview_questions` (around line 784-799). Add immediately after that block:

```python
# Feynman mode trigger
if agent_ctx.feynman_concept:
    yield sse({
        "type": "feynman_prompt",
        "concept_name": agent_ctx.feynman_concept,
    })
```

No message persistence needed here — the Feynman submission will be saved separately when the user submits.

- [ ] **Step 2: Verify the chat endpoint still loads**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.chat import router; print('router loaded')"`
Expected: `router loaded`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/chat.py
git commit -m "feat: emit feynman_prompt SSE event from post-run loop"
```

---

### Task 5: Extend `TestResult` model with Feynman-specific fields

**Files:**
- Modify: `backend/app/models/mastery.py:39-48` (TestResult model)

- [ ] **Step 1: Add fields to TestResult**

In `backend/app/models/mastery.py`, extend the `TestResult` model with optional Feynman-specific fields:

```python
class TestResult(MongoBase):
    user_id: str
    concept_id: str
    thread_id: str
    test_type: Literal["feynman", "conceptual", "application"]
    question: str
    user_response: str
    scores: TestScores
    overall_score: float
    feedback: str
    # Feynman-specific fields
    status: Literal["scoring", "scored", "failed"] | None = None
    strong_topics: list[str] = Field(default_factory=list)
    weak_areas: list[str] = Field(default_factory=list)
    missed_topics: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    hint_ids: list[str] = Field(default_factory=list)
```

Add `Field` to the pydantic imports at the top if not already present:
```python
from pydantic import BaseModel, Field
```

- [ ] **Step 2: Verify model instantiation**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.models.mastery import TestResult, TestScores; r = TestResult(user_id='u', concept_id='c', thread_id='t', test_type='feynman', question='explain X', user_response='...', scores=TestScores(clarity=0.8, accuracy=0.7, depth=0.6, transferability=0.5), overall_score=0.65, feedback='good', status='scoring'); print(r.status, r.strong_topics)"`
Expected: `scoring []`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/mastery.py
git commit -m "feat: extend TestResult with Feynman-specific fields"
```

---

## Chunk 2: Backend — Feynman Router (Hint & Submit Endpoints)

### Task 6: Create Feynman router with hint endpoint

**Files:**
- Create: `backend/app/api/feynman.py`
- Modify: `backend/main.py` (mount the new router)

- [ ] **Step 1: Create the feynman router with hint endpoint**

Create `backend/app/api/feynman.py`:

```python
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import LLM_API_KEY, LLM_BASE_URL, DEFAULT_MODEL
from app.db import mongo

router = APIRouter(prefix="/api/feynman", tags=["feynman"])

_oai = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)
MODEL = DEFAULT_MODEL


# ── Request / Response schemas ──────────────────────────────────────

class HintRequest(BaseModel):
    thread_id: str
    concept_name: str
    current_content: str | None = None


class HintResponse(BaseModel):
    hint: str
    hint_id: str


# ── Hint endpoint ───────────────────────────────────────────────────

@router.post("/hint", response_model=HintResponse)
async def get_hint(req: HintRequest) -> HintResponse:
    """Generate a nudge hint for the learner without giving away the answer."""

    # Build context from conversation history
    messages_cursor = mongo.messages().find(
        {"thread_id": req.thread_id},
        sort=[("index", 1)],
    )
    conversation = []
    for msg in messages_cursor:
        conversation.append(f"{msg['role']}: {msg['content'][:500]}")
    conv_context = "\n".join(conversation[-20:])  # last 20 messages

    draft_context = ""
    if req.current_content:
        draft_context = f"\n\nThe learner's current draft:\n{req.current_content}"

    system_prompt = (
        "You are a learning assistant. The learner is trying to explain a concept "
        "in their own words (Feynman technique). They need a subtle hint — a nudge "
        "about what to think about next, WITHOUT giving away the answer.\n\n"
        "Rules:\n"
        "- One sentence only\n"
        "- Point toward a direction, not the answer\n"
        "- If they have a draft, hint about something they haven't covered yet\n"
        "- Be encouraging but not patronizing\n\n"
        f"Concept: {req.concept_name}\n\n"
        f"Recent conversation context:\n{conv_context}"
        f"{draft_context}"
    )

    response = await _oai.chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": system_prompt}],
        max_tokens=100,
    )
    hint_text = response.choices[0].message.content or "Think about the key relationships."

    # Log to MongoDB
    hint_doc = {
        "thread_id": req.thread_id,
        "concept_name": req.concept_name,
        "hint_text": hint_text,
        "timestamp": datetime.now(timezone.utc),
    }
    result = mongo.feynman_hints().insert_one(hint_doc)

    return HintResponse(hint=hint_text, hint_id=str(result.inserted_id))
```

- [ ] **Step 2: Mount the router in main.py**

In `backend/main.py`, add:

```python
from app.api.feynman import router as feynman_router

app.include_router(feynman_router)
```

Add this next to where the existing `chat_router` is mounted.

- [ ] **Step 3: Verify endpoint loads**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.feynman import router; print([r.path for r in router.routes])"`
Expected: `['/hint']` (or similar showing the route)

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/feynman.py backend/main.py
git commit -m "feat: add feynman router with hint endpoint"
```

---

### Task 7: Add submit endpoint with async scoring

**Files:**
- Modify: `backend/app/api/feynman.py` (add submit endpoint + scoring task)

- [ ] **Step 1: Add request schema and scoring function**

Add to `backend/app/api/feynman.py` after the existing schemas:

```python
class SubmitRequest(BaseModel):
    thread_id: str
    concept_name: str
    markdown: str
    hint_ids: list[str] = []


class SubmitResponse(BaseModel):
    submission_id: str
    status: str
```

- [ ] **Step 2: Add the scoring background task**

Add to `backend/app/api/feynman.py`:

```python
async def _score_feynman_submission(submission_id: str, req: SubmitRequest) -> None:
    """Background task: score a Feynman explanation via LLM."""
    try:
        # Gather context
        messages_cursor = mongo.messages().find(
            {"thread_id": req.thread_id},
            sort=[("index", 1)],
        )
        conversation = []
        for msg in messages_cursor:
            conversation.append(f"{msg['role']}: {msg['content'][:500]}")
        conv_context = "\n".join(conversation[-30:])

        # Gather hints used
        hints_context = ""
        if req.hint_ids:
            hint_docs = list(mongo.feynman_hints().find(
                {"_id": {"$in": [ObjectId(h) for h in req.hint_ids]}}
            ))
            hints_text = "\n".join(f"- {h['hint_text']}" for h in hint_docs)
            hints_context = f"\n\nHints the learner requested ({len(hint_docs)} total):\n{hints_text}"

        system_prompt = (
            "You are an expert learning evaluator. Score a learner's Feynman explanation.\n\n"
            "Score each dimension 0.0-1.0:\n"
            "- clarity: How clear and well-organized is the explanation?\n"
            "- accuracy: Is the content factually correct?\n"
            "- depth: Does it go beyond surface-level?\n"
            "- transferability: Could someone learn from this explanation?\n\n"
            "Also identify:\n"
            "- strong_topics: Topics explained well (list of strings)\n"
            "- weak_areas: Topics explained poorly or incorrectly (list of strings)\n"
            "- missed_topics: Topics from the teaching conversation NOT covered in the explanation (list of strings)\n"
            "- improvements: Specific actionable suggestions (list of strings)\n"
            "- feedback: A 2-3 sentence overall assessment\n"
            "- overall_score: Weighted average of the 4 dimensions (0.0-1.0)\n\n"
            f"Concept: {req.concept_name}\n\n"
            f"Teaching conversation:\n{conv_context}"
            f"{hints_context}\n\n"
            f"Learner's explanation:\n{req.markdown}"
        )

        response = await _oai.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": system_prompt}],
            response_format={"type": "json_object"},
            max_tokens=1000,
        )

        scores = json.loads(response.choices[0].message.content or "{}")

        mongo.test_results().update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {
                "scores": {
                    "clarity": scores.get("clarity", 0.0),
                    "accuracy": scores.get("accuracy", 0.0),
                    "depth": scores.get("depth", 0.0),
                    "transferability": scores.get("transferability", 0.0),
                },
                "overall_score": scores.get("overall_score", 0.0),
                "feedback": scores.get("feedback", ""),
                "strong_topics": scores.get("strong_topics", []),
                "weak_areas": scores.get("weak_areas", []),
                "missed_topics": scores.get("missed_topics", []),
                "improvements": scores.get("improvements", []),
                "status": "scored",
            }},
        )
    except Exception:
        mongo.test_results().update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {"status": "failed"}},
        )
```

- [ ] **Step 3: Add the submit endpoint**

Add to `backend/app/api/feynman.py`:

```python
@router.post("/submit", response_model=SubmitResponse, status_code=202)
async def submit_explanation(req: SubmitRequest) -> SubmitResponse:
    """Submit a Feynman explanation for async scoring."""

    # Look up thread to get user_id
    thread = mongo.threads().find_one({"_id": ObjectId(req.thread_id)})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Save submission as test_result with status=scoring
    doc = {
        "user_id": thread["user_id"],
        "concept_id": req.concept_name,
        "thread_id": req.thread_id,
        "test_type": "feynman",
        "question": f"Explain: {req.concept_name}",
        "user_response": req.markdown,
        "scores": {"clarity": 0.0, "accuracy": 0.0, "depth": 0.0, "transferability": 0.0},
        "overall_score": 0.0,
        "feedback": "",
        "status": "scoring",
        "strong_topics": [],
        "weak_areas": [],
        "missed_topics": [],
        "improvements": [],
        "hint_ids": req.hint_ids,
        "created_at": datetime.now(timezone.utc),
    }
    result = mongo.test_results().insert_one(doc)
    submission_id = str(result.inserted_id)

    # Also save as a message in the conversation (save_message is synchronous)
    from app.api.chat import save_message
    last_msg = mongo.messages().find_one(
        {"thread_id": req.thread_id},
        sort=[("index", -1)],
    )
    next_index = (last_msg["index"] + 1) if last_msg else 0
    save_message(
        user_id=thread["user_id"],
        thread_id=req.thread_id,
        role="user",
        content=req.markdown,
        msg_type="feynman_input",
        group_id=str(thread.get("evermemos_group_id", req.thread_id)),
        index=next_index,
    )

    # Kick off background scoring
    asyncio.create_task(_score_feynman_submission(submission_id, req))

    return SubmitResponse(submission_id=submission_id, status="scoring")
```

- [ ] **Step 4: Verify both endpoints load**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.feynman import router; print([r.path for r in router.routes])"`
Expected: Shows both `/hint` and `/submit`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/feynman.py
git commit -m "feat: add feynman submit endpoint with async scoring"
```

---

## Chunk 3: Frontend — API Client, SSE Handling & Hook

### Task 8: Extend SSEEvent type and add Feynman API functions

**Files:**
- Modify: `client/lib/api.ts:17-28` (SSEEvent type union)
- Modify: `client/lib/api.ts` (add new API functions at end)

- [ ] **Step 1: Add `feynman_prompt` to SSEEvent union**

In `client/lib/api.ts`, add to the `SSEEvent` type union (after the `interview_questions` line):

```typescript
  | { type: "feynman_prompt"; concept_name: string }
```

- [ ] **Step 2: Add Feynman API functions**

At the end of `client/lib/api.ts`, add:

```typescript
// ── Feynman Mode ────────────────────────────────────────────────────

export interface HintResponse {
  hint: string;
  hint_id: string;
}

export async function requestFeynmanHint(
  threadId: string,
  conceptName: string,
  currentContent?: string,
): Promise<HintResponse> {
  const res = await fetch(`${API_BASE}/feynman/hint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      concept_name: conceptName,
      current_content: currentContent || null,
    }),
  });
  if (!res.ok) throw new Error("Failed to get hint");
  return res.json();
}

export interface SubmitFeynmanResponse {
  submission_id: string;
  status: string;
}

export async function submitFeynmanExplanation(
  threadId: string,
  conceptName: string,
  markdown: string,
  hintIds: string[],
): Promise<SubmitFeynmanResponse> {
  const res = await fetch(`${API_BASE}/feynman/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      concept_name: conceptName,
      markdown,
      hint_ids: hintIds,
    }),
  });
  if (!res.ok) throw new Error("Failed to submit explanation");
  return res.json();
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build 2>&1 | head -20`
Expected: No type errors in `api.ts`

- [ ] **Step 4: Commit**

```bash
git add client/lib/api.ts
git commit -m "feat: add feynman_prompt SSE type and feynman API functions"
```

---

### Task 9: Handle `feynman_prompt` event in useChat hook

**Files:**
- Modify: `client/hooks/use-chat.ts` (add state, event handler, and helper functions)

- [ ] **Step 1: Add Feynman state to the hook**

In `client/hooks/use-chat.ts`, add state declarations near the existing `interviewQuestions` state:

```typescript
const [feynmanOpen, setFeynmanOpen] = useState(false);
const [feynmanConcept, setFeynmanConcept] = useState<string | null>(null);
const pendingFeynmanRef = useRef<string | null>(null);
```

- [ ] **Step 2: Add `feynman_prompt` case to SSE switch**

In the `streamChat` callback's switch statement (around line 223, after the `interview_questions` case), add:

```typescript
case "feynman_prompt":
  // Store in a ref and apply after "end" event, same pattern as pendingInterviewRef.
  // This prevents opening the modal while streaming is still in progress.
  pendingFeynmanRef.current = event.concept_name;
  break;
```

- [ ] **Step 3: Apply pending Feynman state on "end" event**

In the SSE switch statement, find the `case "end"` block. Add after `setIsStreaming(false)`:

```typescript
// Apply pending Feynman prompt after streaming ends
if (pendingFeynmanRef.current) {
  setFeynmanOpen(true);
  setFeynmanConcept(pendingFeynmanRef.current);
  pendingFeynmanRef.current = null;
}
```

- [ ] **Step 4: Add helper functions**

Add before the return statement:

```typescript
const dismissFeynman = useCallback(() => {
  setFeynmanOpen(false);
  setFeynmanConcept(null);
}, []);
```

- [ ] **Step 4: Update the `UseChatReturn` interface**

Find the `UseChatReturn` interface (around line 29-39) and add the new fields:

```typescript
feynmanOpen: boolean;
feynmanConcept: string | null;
dismissFeynman: () => void;
```

- [ ] **Step 5: Add to the hook's return value**

Add to the returned object:

```typescript
feynmanOpen,
feynmanConcept,
dismissFeynman,
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build 2>&1 | head -20`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add client/hooks/use-chat.ts
git commit -m "feat: handle feynman_prompt SSE event in useChat hook"
```

---

## Chunk 4: Frontend — FeynmanModal Component

### Task 10: Install BlockNote

**Files:**
- Modify: `client/package.json` (new dependencies)

- [ ] **Step 1: Install BlockNote packages**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm add @blocknote/core @blocknote/react @blocknote/shadcn @blocknote/mantine`

Note: `@blocknote/shadcn` provides shadcn-styled components. `@blocknote/mantine` may be needed as a peer dep. Check BlockNote docs if install warns about missing peers.

- [ ] **Step 2: Verify install succeeded**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build 2>&1 | head -20`
Expected: Builds without errors

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/pnpm-lock.yaml
git commit -m "feat: add BlockNote editor dependencies"
```

---

### Task 11: Create HintBanner component

**Files:**
- Create: `client/components/hint-banner.tsx`

- [ ] **Step 1: Create the HintBanner component**

Create `client/components/hint-banner.tsx`:

```tsx
"use client";

import { X } from "lucide-react";

interface HintBannerProps {
  hints: { id: string; text: string }[];
  onDismiss: (id: string) => void;
}

export function HintBanner({ hints, onDismiss }: HintBannerProps) {
  if (hints.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      {hints.map((hint) => (
        <div
          key={hint.id}
          className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
        >
          <span className="mt-0.5 shrink-0 text-base">💡</span>
          <p className="flex-1 leading-relaxed">{hint.text}</p>
          <button
            onClick={() => onDismiss(hint.id)}
            className="shrink-0 rounded p-0.5 hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/components/hint-banner.tsx
git commit -m "feat: add HintBanner component"
```

---

### Task 12: Create FeynmanModal component

**Files:**
- Create: `client/components/feynman-modal.tsx`

This is the core UI component. It uses BlockNote for the editor, integrates `/hint` as a custom slash command, handles localStorage draft persistence, and wires up submit.

- [ ] **Step 1: Create the FeynmanModal component**

Create `client/components/feynman-modal.tsx`. Use the `@frontend-design:frontend-design` skill for styling guidance — this should be a visually striking full-screen writing experience, not a generic modal.

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BlockNoteEditor,
  BlockNoteSchema,
  defaultBlockSpecs,
  type Block,
} from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";

import { Button } from "@/components/ui/button";
import { HintBanner } from "@/components/hint-banner";
import { requestFeynmanHint, submitFeynmanExplanation } from "@/lib/api";
import { X } from "lucide-react";

interface FeynmanModalProps {
  threadId: string;
  conceptName: string;
  onClose: () => void;
}

const DRAFT_KEY = (threadId: string, concept: string) =>
  `feynman-draft:${threadId}:${concept}`;

export function FeynmanModal({
  threadId,
  conceptName,
  onClose,
}: FeynmanModalProps) {
  const [hints, setHints] = useState<{ id: string; text: string }[]>([]);
  const [hintIds, setHintIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const hasContentRef = useRef(false);

  // Create editor with custom /hint slash menu item
  const editor = useCreateBlockNote({
    domAttributes: {
      editor: {
        class: "feynman-editor",
      },
    },
  });

  // Restore draft from localStorage on mount
  useEffect(() => {
    const key = DRAFT_KEY(threadId, conceptName);
    const draft = localStorage.getItem(key);
    if (draft) {
      try {
        const blocks = JSON.parse(draft) as Block[];
        if (blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch {
        // ignore corrupt drafts
      }
    }
  }, [editor, threadId, conceptName]);

  // Save draft to localStorage on change
  useEffect(() => {
    const key = DRAFT_KEY(threadId, conceptName);
    const interval = setInterval(() => {
      const blocks = editor.document;
      const hasText = blocks.some(
        (b) =>
          b.content &&
          Array.isArray(b.content) &&
          b.content.some((c: any) => c.type === "text" && c.text.trim()),
      );
      hasContentRef.current = hasText;
      if (hasText) {
        localStorage.setItem(key, JSON.stringify(blocks));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [editor, threadId, conceptName]);

  const handleHint = useCallback(async () => {
    if (isHintLoading) return;
    setIsHintLoading(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      const res = await requestFeynmanHint(threadId, conceptName, markdown);
      setHints((prev) => [...prev, { id: res.hint_id, text: res.hint }]);
      setHintIds((prev) => [...prev, res.hint_id]);
    } catch {
      // silently fail — hint is optional
    } finally {
      setIsHintLoading(false);
    }
  }, [editor, threadId, conceptName, isHintLoading]);

  const handleDismissHint = useCallback((id: string) => {
    setHints((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      await submitFeynmanExplanation(threadId, conceptName, markdown, hintIds);
      // Clear draft
      localStorage.removeItem(DRAFT_KEY(threadId, conceptName));
      onClose();
      // Toast notification — use whatever toast the project has (e.g., sonner or a simple alert)
      // If no toast library is installed, add `sonner` (`pnpm add sonner`) and use:
      //   import { toast } from "sonner";
      //   toast("Explanation submitted — scoring in progress");
      // For now, a simple approach that works without extra deps:
      alert("Explanation submitted — scoring in progress");
    } catch {
      setIsSubmitting(false);
    }
  }, [editor, threadId, conceptName, hintIds, onClose]);

  const handleClose = useCallback(() => {
    if (hasContentRef.current) {
      if (!window.confirm("Discard your explanation?")) return;
    }
    onClose();
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Feynman Mode
          </p>
          <h1 className="mt-1 text-xl font-semibold">
            Explain: {conceptName}
          </h1>
        </div>
        <button
          onClick={handleClose}
          className="rounded-lg p-2 hover:bg-accent"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Hints */}
      <HintBanner hints={hints} onDismiss={handleDismissHint} />

      {/* Editor */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <BlockNoteView
            editor={editor}
            theme="light"
            data-feynman-editor
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleHint}
          disabled={isHintLoading}
        >
          {isHintLoading ? "Getting hint..." : "💡 Hint"}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Submitting..." : "Submit Explanation"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build 2>&1 | head -30`
Expected: No type errors (there may be warnings about unused imports until we integrate)

- [ ] **Step 3: Commit**

```bash
git add client/components/feynman-modal.tsx
git commit -m "feat: add FeynmanModal component with BlockNote editor"
```

---

### Task 13: Add `/hint` as a custom slash menu item in BlockNote

**Files:**
- Modify: `client/components/feynman-modal.tsx` (enhance editor with custom slash menu)

- [ ] **Step 1: Add custom slash menu item**

The `/hint` command should appear in BlockNote's slash menu. Update the `useCreateBlockNote` call and add a custom slash menu. The exact API depends on the installed BlockNote version — check `node_modules/@blocknote/react/dist` for the `SuggestionMenuController` or `getDefaultReactSlashMenuItems` export.

The general approach:

```tsx
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";

// Inside FeynmanModal, create custom slash menu items:
const getCustomSlashMenuItems = (editor: BlockNoteEditor) => [
  ...getDefaultReactSlashMenuItems(editor),
  {
    title: "Hint",
    subtext: "Get a nudge about what to cover next",
    group: "Other",
    icon: <span>💡</span>,
    onItemClick: () => handleHint(),
  },
];

// In the JSX, wrap BlockNoteView:
<BlockNoteView editor={editor} theme="light">
  <SuggestionMenuController
    triggerCharacter="/"
    getItems={async (query) =>
      getCustomSlashMenuItems(editor).filter((item) =>
        item.title.toLowerCase().includes(query.toLowerCase()),
      )
    }
  />
</BlockNoteView>
```

Note: The exact API may differ. Consult BlockNote docs at https://www.blocknotejs.org/docs/editor-basics/slash-menu if the above doesn't compile. The key requirement is that `/hint` appears in the slash menu and calls `handleHint()`.

- [ ] **Step 2: Verify the slash menu renders**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build 2>&1 | head -20`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add client/components/feynman-modal.tsx
git commit -m "feat: add /hint custom slash menu item to BlockNote editor"
```

---

## Chunk 5: Frontend — Integration & Wiring

### Task 14: Integrate FeynmanModal into the chat page

**Files:**
- Modify: `client/app/threads/[threadId]/page.tsx` (add modal rendering)

- [ ] **Step 1: Import and destructure Feynman state**

In `client/app/threads/[threadId]/page.tsx`, add the import:

```typescript
import { FeynmanModal } from "@/components/feynman-modal";
```

Update the `useChat` destructuring to include the new fields:

```typescript
const {
  messages,
  // ... existing fields ...
  feynmanOpen,
  feynmanConcept,
  dismissFeynman,
} = useChat(threadId);
```

- [ ] **Step 2: Render the FeynmanModal**

Add the modal rendering at the end of the JSX, just before the closing `</MainContent>` or the outermost closing tag:

```tsx
{feynmanOpen && feynmanConcept && (
  <FeynmanModal
    threadId={threadId}
    conceptName={feynmanConcept}
    onClose={dismissFeynman}
  />
)}
```

- [ ] **Step 3: Verify the page compiles and renders**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

1. Run backend: `cd backend && uv run uvicorn main:app --reload --port 8000`
2. Run frontend: `cd client && pnpm dev`
3. Open a teaching-phase thread
4. Verify no errors on the chat page
5. To test the modal, temporarily add a button or use browser console:
   ```js
   // In browser console on the chat page:
   // This won't work directly due to React state, but you can
   // temporarily add a test button in the JSX for validation
   ```

- [ ] **Step 5: Commit**

```bash
git add client/app/threads/[threadId]/page.tsx
git commit -m "feat: integrate FeynmanModal into chat page"
```

---

### Task 15: Add BlockNote CSS to global styles

**Files:**
- Modify: `client/app/globals.css` (add BlockNote theme overrides)

- [ ] **Step 1: Add Feynman editor styles**

In `client/app/globals.css`, add at the end:

```css
/* ── Feynman Mode Editor ───────────────────────────────────────── */

.feynman-editor {
  min-height: 60vh;
  font-size: 1rem;
  line-height: 1.75;
}

[data-feynman-editor] .bn-editor {
  padding: 0;
}

[data-feynman-editor] .bn-block-group {
  padding: 0;
}
```

- [ ] **Step 2: Verify styles don't break existing UI**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm dev`
Check that existing chat pages render correctly.

- [ ] **Step 3: Commit**

```bash
git add client/app/globals.css
git commit -m "feat: add Feynman editor CSS overrides"
```

---

### Task 16: End-to-end verification

- [ ] **Step 1: Start backend and frontend**

```bash
# Terminal 1
cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run uvicorn main:app --reload --port 8000

# Terminal 2
cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm dev
```

- [ ] **Step 2: Test the hint endpoint directly**

```bash
curl -X POST http://localhost:8000/api/feynman/hint \
  -H "Content-Type: application/json" \
  -d '{"thread_id": "<a-real-thread-id>", "concept_name": "test concept"}'
```

Expected: `{"hint": "...", "hint_id": "..."}`

- [ ] **Step 3: Test the submit endpoint directly**

```bash
curl -X POST http://localhost:8000/api/feynman/submit \
  -H "Content-Type: application/json" \
  -d '{"thread_id": "<a-real-thread-id>", "concept_name": "test concept", "markdown": "# Test\nThis is a test.", "hint_ids": []}' \
  -w "\n%{http_code}"
```

Expected: `202` status with `{"submission_id": "...", "status": "scoring"}`

- [ ] **Step 4: Verify scoring completes**

After a few seconds, check MongoDB for the scored result:

```bash
cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "
from app.db import mongo
result = mongo.test_results().find_one({'test_type': 'feynman'}, sort=[('_id', -1)])
print(result['status'] if result else 'no results found')
print(result.get('scores') if result else '')
"
```

Expected: `scored` status with non-zero scores

- [ ] **Step 5: Test modal via agent trigger**

Navigate to a teaching-phase thread and interact with the AI until it calls `trigger_feynman`. The modal should open. If the agent doesn't naturally trigger it, you can verify the SSE event works by checking the tool is available in the teaching phase tools.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during e2e testing"
```
