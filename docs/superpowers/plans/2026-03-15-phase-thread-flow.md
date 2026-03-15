# Phase-Threaded Learning Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-thread teaching with per-phase child threads, automatic Feynman testing after each concept completion, and sibling-thread phase transitions with scoring feedback.

**Architecture:** Root thread handles interview + plan generation. When the user clicks "Start", a child thread is created for Phase 1. Teaching happens there. After `update_plan_progress` marks a concept done, the backend automatically triggers Feynman mode (no agent decision). When the last concept in a phase completes its Feynman test, a "Continue to Next Phase" button appears. Clicking it creates a sibling thread (child of root) for Phase i+1 with a context system prompt. The Feynman submit endpoint is wired to the evaluation agent and returns scores to the frontend.

**Tech Stack:** Python/FastAPI (backend), Next.js/React (frontend), MongoDB, OpenAI Agents SDK, BlockNote editor

---

## File Structure

### Backend (modify)
- `backend/app/api/chat.py` — Add `start_phase` endpoint, modify `update_plan_progress` SSE to auto-trigger Feynman, add `phase_completed` + `next_phase_button` SSE events, add sibling-thread creation endpoint
- `backend/app/api/feynman.py` — Fix `ObjectId` vs string `_id` bug, wire scoring to mastery service, add score polling endpoint, return scores in response
- `backend/app/tools_impl.py` — Modify `update_plan_progress` to detect last-concept-in-phase and set context flags
- `backend/app/agent/phases.py` — No changes needed (transitions are now UI-driven)
- `backend/app/plan_parser.py` — Add helper to find phase containing a concept

### Frontend (modify)
- `client/lib/api.ts` — Add `startPhase`, `getFeynmanResult`, `createNextPhaseThread` API functions, new SSE event types
- `client/hooks/use-chat.ts` — Handle new SSE events (`feynman_auto_trigger`, `phase_complete`, `next_phase_ready`), add Feynman result polling
- `client/components/feynman-modal.tsx` — Show scoring results after submission, add "Continue" callback
- `client/app/threads/[threadId]/page.tsx` — Render "Start Learning" button after plan creation, render "Continue to Next Phase" button, wire Feynman completion flow

### Frontend (create)
- `client/components/feynman-results.tsx` — Score display component (4 dimensions + feedback)
- `client/components/phase-action-button.tsx` — Reusable button for "Start Learning" and "Continue to Next Phase"

---

## Chunk 1: Backend — Auto-Feynman on concept completion + phase detection

### Task 1: Add `phase_for_concept()` helper to plan_parser

**Files:**
- Modify: `backend/app/plan_parser.py`
- Test: `backend/tests/test_plan_parser.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_plan_parser.py`:

```python
from app.plan_parser import parse_plan, phase_for_concept

SAMPLE_PLAN = """\
# Test Topic

> **Depth:** beginner | **Prior knowledge:** none

## Phase 1: Basics
- [x] Concept A — first concept
- [ ] Concept B — second concept

## Phase 2: Advanced
- [ ] Concept C — third concept
- [ ] Concept D — fourth concept
"""

def test_phase_for_concept_found():
    tree = parse_plan(SAMPLE_PLAN)
    phase, concept, is_last = phase_for_concept(tree, "Concept B")
    assert phase.title == "Basics"
    assert concept.name == "Concept B"
    assert is_last is True  # last uncompleted in phase 1

def test_phase_for_concept_not_last():
    tree = parse_plan(SAMPLE_PLAN)
    phase, concept, is_last = phase_for_concept(tree, "Concept C")
    assert phase.title == "Advanced"
    assert is_last is False  # Concept D still uncompleted

def test_phase_for_concept_not_found():
    tree = parse_plan(SAMPLE_PLAN)
    result = phase_for_concept(tree, "Nonexistent")
    assert result is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest tests/test_plan_parser.py -v`
Expected: FAIL — `phase_for_concept` not defined

- [ ] **Step 3: Implement `phase_for_concept`**

Add to `backend/app/plan_parser.py` after the `PlanTree` class:

```python
def phase_for_concept(
    tree: PlanTree, concept_name: str
) -> tuple[PlanPhase, PlanConcept, bool] | None:
    """Find the phase containing a concept and whether it's the last uncompleted concept in that phase.

    Returns (phase, concept, is_last_in_phase) or None if not found.
    is_last_in_phase is True when marking this concept complete would make phase.progress == 1.0.
    """
    stripped = concept_name.strip("*")
    for phase in tree.phases:
        for concept in phase.concepts:
            if concept.name == stripped or concept.name == concept_name:
                # Count remaining uncompleted concepts (excluding the one being completed)
                remaining = sum(
                    1 for c in phase.concepts
                    if not c.completed and c.name != concept.name
                )
                return phase, concept, remaining == 0
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest tests/test_plan_parser.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/plan_parser.py backend/tests/test_plan_parser.py
git commit -m "feat: add phase_for_concept helper for phase boundary detection"
```

### Task 2: Modify `update_plan_progress` to return phase completion info

**Files:**
- Modify: `backend/app/tools_impl.py:320-362`

- [ ] **Step 1: Update `update_plan_progress` to include phase completion data**

In `backend/app/tools_impl.py`, modify the `update_plan_progress` function. After the plan is re-parsed (line 348), replace the phase_progress lookup (lines 349-355) and return (lines 357-362) with:

```python
    tree = parse_plan(content)

    from app.plan_parser import phase_for_concept
    phase_info = phase_for_concept(tree, concept_name)
    phase_progress = 0.0
    phase_title = ""
    is_last_in_phase = False
    is_last_phase = False
    next_phase_title = ""

    if phase_info:
        phase, _, is_last_in_phase = phase_info
        phase_progress = phase.progress
        phase_title = phase.title
        # Check if this is the last phase in the plan
        is_last_phase = phase.order == len(tree.phases)
        # Find next phase title
        if not is_last_phase:
            for p in tree.phases:
                if p.order == phase.order + 1:
                    next_phase_title = p.title
                    break

    return json.dumps({
        "updated": True,
        "concept": concept_name,
        "phase_progress": round(phase_progress, 2),
        "overall_progress": round(tree.overall_progress, 2),
        "phase_title": phase_title,
        "is_last_in_phase": is_last_in_phase,
        "is_last_phase": is_last_phase,
        "next_phase_title": next_phase_title,
    })
```

- [ ] **Step 2: Verify backend still starts**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.tools_impl import update_plan_progress; print('OK')"`
Expected: prints `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/tools_impl.py
git commit -m "feat: update_plan_progress returns phase completion metadata"
```

### Task 3: Auto-trigger Feynman in chat.py after `update_plan_progress`

**Files:**
- Modify: `backend/app/api/chat.py:905-932` (tool_call_output_item handling)

Currently the agent decides when to call `trigger_feynman`. We want the backend to auto-trigger Feynman mode whenever `update_plan_progress` succeeds, bypassing the agent's decision.

- [ ] **Step 1: Add auto-Feynman trigger in the tool result handler**

In `chat.py`, inside the `elif item.type == "tool_call_output_item":` block (around line 908), after the existing `topic_slug` detection (lines 924-931), add:

```python
                        # Auto-trigger Feynman after concept completion
                        if result_tool_name == "update_plan_progress" and "updated" in output:
                            try:
                                parsed_result: dict[str, object] = json.loads(output)
                                if parsed_result.get("updated"):
                                    concept = str(parsed_result.get("concept", ""))
                                    if concept:
                                        # Override any agent-initiated feynman trigger
                                        agent_ctx.feynman_concept = concept
                                        # Store phase completion info for later SSE emission
                                        agent_ctx.phase_completed = parsed_result.get("is_last_in_phase", False)
                                        agent_ctx.phase_is_final = parsed_result.get("is_last_phase", False)
                                        agent_ctx.next_phase_title = str(parsed_result.get("next_phase_title", ""))
                                        agent_ctx.completed_phase_title = str(parsed_result.get("phase_title", ""))
                            except (json.JSONDecodeError, KeyError):
                                pass
```

- [ ] **Step 2: Add the new fields to `AgentContext`**

In `backend/app/tools_impl.py`, add to the `AgentContext` dataclass (around line 23-34):

```python
    # Phase completion tracking (set by chat.py when update_plan_progress runs)
    phase_completed: bool = False
    phase_is_final: bool = False
    next_phase_title: str = ""
    completed_phase_title: str = ""
```

- [ ] **Step 3: Emit `phase_complete` SSE event after the Feynman prompt**

In `chat.py`, after the existing `feynman_prompt` SSE emission block (around line 1038-1042), add:

```python
        # Phase completion — tell frontend to show "Continue to Next Phase" after Feynman test
        if agent_ctx.phase_completed:
            yield sse({
                "type": "phase_complete",
                "phase_title": agent_ctx.completed_phase_title,
                "is_final_phase": agent_ctx.phase_is_final,
                "next_phase_title": agent_ctx.next_phase_title,
            })
```

- [ ] **Step 4: Verify the backend starts cleanly**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.chat import router; print('OK')"`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/chat.py backend/app/tools_impl.py
git commit -m "feat: auto-trigger Feynman mode on concept completion, emit phase_complete SSE"
```

---

## Chunk 2: Backend — Feynman scoring pipeline + phase thread creation

### Task 4: Wire Feynman scoring to mastery service

**Files:**
- Modify: `backend/app/api/feynman.py:101-174` (`_score_feynman_submission`)
- Modify: `backend/app/api/feynman.py:179-230` (`submit_explanation`)

Currently `_score_feynman_submission` scores via LLM and saves to `test_results`, but never calls `update_concept_mastery`. Also, the frontend has no way to poll for the result. Additionally, `submit_explanation` uses `ObjectId(req.thread_id)` for thread lookup but thread `_id` values are strings.

- [ ] **Step 0: Fix ObjectId bug in `submit_explanation`**

In `backend/app/api/feynman.py` line 184, change:
```python
thread = mongo.threads().find_one({"_id": ObjectId(req.thread_id)})
```
to:
```python
thread = mongo.threads().find_one({"_id": req.thread_id})
```

- [ ] **Step 1: Wire mastery update into `_score_feynman_submission`**

In `backend/app/api/feynman.py`, at the end of the `try` block in `_score_feynman_submission` (after line 169, before `except`), add:

```python
                # Update concept mastery with the scored result
                from app.services.mastery import update_concept_mastery
                thread = mongo.threads().find_one({"_id": req.thread_id})
                if thread:
                    mastery_result = update_concept_mastery(
                        user_id=str(thread["user_id"]),
                        concept_name=req.concept_name,
                        topic_slug=str(thread.get("topic_slug", "")),
                        overall_score=scores.get("overall_score", 0.0),
                        weak_areas=scores.get("weak_areas", []),
                    )
                    # Store mastery update alongside the test result
                    mongo.test_results().update_one(
                        {"_id": ObjectId(submission_id)},
                        {"$set": {"mastery_update": mastery_result}},
                    )
```

- [ ] **Step 2: Add score polling endpoint**

Add to `backend/app/api/feynman.py` after the submit endpoint:

```python
@router.get("/result/{submission_id}")
async def get_feynman_result(submission_id: str):
    """Poll for Feynman test scoring result."""
    doc = mongo.test_results().find_one({"_id": ObjectId(submission_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Submission not found")

    return {
        "submission_id": submission_id,
        "status": doc.get("status", "scoring"),
        "scores": doc.get("scores"),
        "overall_score": doc.get("overall_score", 0.0),
        "feedback": doc.get("feedback", ""),
        "strong_topics": doc.get("strong_topics", []),
        "weak_areas": doc.get("weak_areas", []),
        "missed_topics": doc.get("missed_topics", []),
        "improvements": doc.get("improvements", []),
        "mastery_update": doc.get("mastery_update"),
    }
```

- [ ] **Step 3: Verify the endpoint loads**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.feynman import router; print('OK')"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/feynman.py
git commit -m "feat: wire Feynman scoring to mastery service, add result polling endpoint"
```

### Task 5: Add `start_phase` and `create_next_phase_thread` endpoints

**Files:**
- Modify: `backend/app/api/chat.py` — Add two new endpoints

- [ ] **Step 1: Add `start_phase` endpoint**

This creates a child thread for Phase 1 when the user clicks "Start Learning" after plan creation.

Add to `chat.py` after the `create_branch` endpoint (around line 673):

```python
@router.post("/threads/{thread_id}/start-phase")
async def start_phase(thread_id: str):
    """Create a child thread for the first phase of the plan."""
    parent = mongo.threads().find_one({"_id": thread_id})
    if not parent:
        return {"error": "Thread not found"}

    topic_slug = str(parent.get("topic_slug", ""))
    if not topic_slug:
        return {"error": "No plan associated with this thread"}

    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"error": "Plan not found"}

    tree = parse_plan(plan_path.read_text())
    if not tree.phases:
        return {"error": "Plan has no phases"}

    first_phase = tree.phases[0]

    child = Thread(
        user_id=str(parent["user_id"]),
        title=f"Phase 1: {first_phase.title}",
        topic_slug=topic_slug,
        phase="teaching",
        depth=1,
        parent_thread_id=thread_id,
        root_thread_id=str(parent.get("root_thread_id", thread_id)),
        evermemos_group_id=str(uuid.uuid4()),
    )
    _ = mongo.threads().insert_one(child.to_doc())

    # Transition root thread to teaching
    apply_transition(
        db_threads=mongo.threads(),
        thread_id=thread_id,
        new_phase="teaching",
    )

    return {
        "thread_id": child.id,
        "title": child.title,
        "phase": "teaching",
        "phase_number": 1,
        "phase_title": first_phase.title,
    }
```

- [ ] **Step 2: Add `create_next_phase_thread` endpoint**

This creates a sibling thread for Phase i+1 when the user clicks "Continue to Next Phase".

Add right after `start_phase`:

```python
@router.post("/threads/{thread_id}/next-phase")
async def create_next_phase_thread(thread_id: str):
    """Create a sibling thread for the next phase of the plan."""
    current = mongo.threads().find_one({"_id": thread_id})
    if not current:
        return {"error": "Thread not found"}

    root_id = str(current.get("root_thread_id", current.get("parent_thread_id", "")))
    root = mongo.threads().find_one({"_id": root_id})
    if not root:
        return {"error": "Root thread not found"}

    topic_slug = str(current.get("topic_slug", "") or root.get("topic_slug", ""))
    if not topic_slug:
        return {"error": "No plan associated"}

    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return {"error": "Plan not found"}

    tree = parse_plan(plan_path.read_text())

    # Find the current phase by looking at which phases are complete
    next_phase = None
    current_phase_order = 0
    for phase in tree.phases:
        if phase.progress < 1.0:
            next_phase = phase
            current_phase_order = phase.order - 1
            break

    if not next_phase:
        return {"error": "All phases completed", "plan_complete": True}

    # Build context message about previous phases
    completed_phases = [p for p in tree.phases if p.progress >= 1.0]
    context_lines = []
    for p in completed_phases:
        concepts = ", ".join(c.name for c in p.concepts)
        context_lines.append(f"- Phase {p.order} ({p.title}): completed — concepts covered: {concepts}")

    phase_context = (
        f"The user has just completed {len(completed_phases)} phase(s) of their learning plan "
        f"and is now starting Phase {next_phase.order}: {next_phase.title}.\n\n"
        f"Completed phases:\n" + "\n".join(context_lines)
    )

    child = Thread(
        user_id=str(root["user_id"]),
        title=f"Phase {next_phase.order}: {next_phase.title}",
        topic_slug=topic_slug,
        phase="teaching",
        depth=1,
        parent_thread_id=root_id,
        root_thread_id=root_id,
        evermemos_group_id=str(uuid.uuid4()),
        parent_summary=phase_context,
    )
    _ = mongo.threads().insert_one(child.to_doc())

    # Mark old thread as explored
    _ = mongo.threads().update_one(
        {"_id": thread_id},
        {"$set": {"status": "explored", "closed_at": utcnow()}},
    )

    return {
        "thread_id": child.id,
        "title": child.title,
        "phase": "teaching",
        "phase_number": next_phase.order,
        "phase_title": next_phase.title,
        "phase_context": phase_context,
    }
```

- [ ] **Step 3: Verify both endpoints load**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run python -c "from app.api.chat import router; print([r.path for r in router.routes[-4:]])"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/chat.py
git commit -m "feat: add start-phase and next-phase endpoints for phase thread creation"
```

---

## Chunk 3: Frontend — API client + SSE event handling

### Task 6: Add new API functions and SSE event types

**Files:**
- Modify: `client/lib/api.ts`

- [ ] **Step 1: Add new SSE event types**

In `client/lib/api.ts`, add to the `SSEEvent` union type (around line 17-31):

```typescript
  | { type: "phase_complete"; phase_title: string; is_final_phase: boolean; next_phase_title: string }
```

- [ ] **Step 2: Add new API functions**

Add after the `submitFeynmanExplanation` function:

```typescript
export interface FeynmanResult {
  submission_id: string;
  status: "scoring" | "scored" | "failed";
  scores: { clarity: number; accuracy: number; depth: number; transferability: number } | null;
  overall_score: number;
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
}

export async function getFeynmanResult(submissionId: string): Promise<FeynmanResult> {
  const res = await fetch(`${API_BASE}/feynman/result/${submissionId}`);
  if (!res.ok) throw new Error("Failed to get Feynman result");
  return res.json();
}

export async function startPhase(
  threadId: string,
): Promise<{ thread_id: string; title: string; phase: string; phase_number: number; phase_title: string }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/start-phase`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to start phase");
  return res.json();
}

export async function createNextPhaseThread(
  threadId: string,
): Promise<{
  thread_id: string;
  title: string;
  phase: string;
  phase_number: number;
  phase_title: string;
  phase_context: string;
  error?: string;
  plan_complete?: boolean;
}> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/next-phase`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to create next phase thread");
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add client/lib/api.ts
git commit -m "feat: add API client for Feynman results, start-phase, and next-phase endpoints"
```

### Task 7: Handle new SSE events in `useChat`

**Files:**
- Modify: `client/hooks/use-chat.ts`

- [ ] **Step 1: Add phase completion state**

In `use-chat.ts`, add state after `pendingBranchSuggestionRef` (around line 90):

```typescript
  const [phaseComplete, setPhaseComplete] = useState<{
    phaseTitle: string;
    isFinalPhase: boolean;
    nextPhaseTitle: string;
  } | null>(null);
  const pendingPhaseCompleteRef = useRef<typeof phaseComplete>(null);
```

- [ ] **Step 2: Handle `phase_complete` SSE event**

In the `switch (event.type)` block (inside `streamChat` callback), add before `case "end"`:

```typescript
          case "phase_complete":
            pendingPhaseCompleteRef.current = {
              phaseTitle: event.phase_title,
              isFinalPhase: event.is_final_phase,
              nextPhaseTitle: event.next_phase_title,
            };
            break;
```

In the `case "end"` handler, after the `pendingBranchSuggestionRef` block (around line 371), add:

```typescript
            if (pendingPhaseCompleteRef.current) {
              setPhaseComplete(pendingPhaseCompleteRef.current);
              pendingPhaseCompleteRef.current = null;
            }
```

- [ ] **Step 3: Add `dismissPhaseComplete` callback and expose state**

Add after `dismissBranchSuggestion`:

```typescript
  const dismissPhaseComplete = useCallback(() => {
    setPhaseComplete(null);
  }, []);
```

Update the `UseChatReturn` interface to include:

```typescript
  phaseComplete: { phaseTitle: string; isFinalPhase: boolean; nextPhaseTitle: string } | null;
  dismissPhaseComplete: () => void;
```

Return them in the return object.

- [ ] **Step 4: Commit**

```bash
git add client/hooks/use-chat.ts
git commit -m "feat: handle phase_complete SSE event in useChat hook"
```

---

## Chunk 4: Frontend — Feynman results + phase action buttons

### Task 8: Create Feynman results component

**Files:**
- Create: `client/components/feynman-results.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { type FeynmanResult } from "@/lib/api";

interface FeynmanResultsProps {
  result: FeynmanResult;
  onContinue: () => void;
}

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

export function FeynmanResults({ result, onContinue }: FeynmanResultsProps) {
  const scores = result.scores;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Your Score</h3>
        <span className="text-2xl font-bold">
          {Math.round(result.overall_score * 100)}%
        </span>
      </div>

      {scores && (
        <div className="space-y-2">
          <ScoreBar label="Clarity" score={scores.clarity} />
          <ScoreBar label="Accuracy" score={scores.accuracy} />
          <ScoreBar label="Depth" score={scores.depth} />
          <ScoreBar label="Transferability" score={scores.transferability} />
        </div>
      )}

      {result.feedback && (
        <p className="text-sm text-muted-foreground">{result.feedback}</p>
      )}

      {result.weak_areas.length > 0 && (
        <div className="text-sm">
          <span className="font-medium">Areas to improve: </span>
          {result.weak_areas.join(", ")}
        </div>
      )}

      {result.mastery_update && (
        <div className="text-xs text-muted-foreground border-t pt-2">
          Mastery: {Math.round(result.mastery_update.previous_score * 100)}% →{" "}
          {Math.round(result.mastery_update.new_score * 100)}% ({result.mastery_update.tier})
        </div>
      )}

      <button
        onClick={onContinue}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/components/feynman-results.tsx
git commit -m "feat: add FeynmanResults score display component"
```

### Task 9: Wire Feynman modal to show scores after submission

**Files:**
- Modify: `client/components/feynman-modal.tsx`

- [ ] **Step 1: Add result polling after submission**

Replace the `handleSubmit` callback (lines 115-126) and add imports + state:

At the top of the file, add import:
```typescript
import { requestFeynmanHint, submitFeynmanExplanation, getFeynmanResult, type FeynmanResult } from "@/lib/api";
import { FeynmanResults } from "@/components/feynman-results";
```

Add to the `FeynmanModalProps` interface:
```typescript
  onSubmitComplete?: (result: FeynmanResult) => void;
```

Add state inside the component:
```typescript
  const [feynmanResult, setFeynmanResult] = useState<FeynmanResult | null>(null);
```

Replace `handleSubmit`:
```typescript
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      const hintIds = hints.map((h) => h.id);
      const { submission_id } = await submitFeynmanExplanation(threadId, conceptName, markdown, hintIds);
      localStorage.removeItem(DRAFT_KEY(threadId, conceptName));

      // Poll for scoring result
      const poll = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const result = await getFeynmanResult(submission_id);
          if (result.status === "scored") {
            setFeynmanResult(result);
            setIsSubmitting(false);
            return;
          }
          if (result.status === "failed") {
            setIsSubmitting(false);
            onClose();
            return;
          }
        }
        // Timeout — close modal
        setIsSubmitting(false);
        onClose();
      };
      poll();
    } catch {
      setIsSubmitting(false);
    }
  }, [editor, threadId, conceptName, hints, onClose]);
```

- [ ] **Step 2: Show results view when scoring completes**

In the modal JSX, replace the Editor and Footer sections with a conditional:

After `{/* Hints */}` and before `</div>` (closing the modal div), replace the editor + footer with:

```tsx
        {feynmanResult ? (
          <div className="flex-1 min-h-0 px-6 py-4 overflow-auto">
            <FeynmanResults
              result={feynmanResult}
              onContinue={() => {
                onSubmitComplete?.(feynmanResult);
                onClose();
              }}
            />
          </div>
        ) : (
          <>
            {/* Editor */}
            <div className="flex-1 min-h-0 px-6 py-4">
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
                {isSubmitting ? "Scoring..." : "Submit Explanation"}
              </Button>
            </div>
          </>
        )}
```

- [ ] **Step 3: Commit**

```bash
git add client/components/feynman-modal.tsx
git commit -m "feat: show Feynman scoring results in modal after submission"
```

### Task 10: Create phase action button component

**Files:**
- Create: `client/components/phase-action-button.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface PhaseActionButtonProps {
  label: string;
  sublabel?: string;
  onClick: () => Promise<void> | void;
}

export function PhaseActionButton({ label, sublabel, onClick }: PhaseActionButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 py-6">
      {sublabel && (
        <p className="text-sm text-muted-foreground">{sublabel}</p>
      )}
      <Button
        size="lg"
        onClick={handleClick}
        disabled={loading}
        className="px-8"
      >
        {loading ? "Loading..." : label}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/components/phase-action-button.tsx
git commit -m "feat: add PhaseActionButton component for phase transitions"
```

---

## Chunk 5: Frontend — Wire it all together in the thread page

### Task 11: Add "Start Learning" button after plan creation

**Files:**
- Modify: `client/app/threads/[threadId]/page.tsx`

- [ ] **Step 1: Import new components and API functions**

Add to imports:
```typescript
import { PhaseActionButton } from "@/components/phase-action-button";
import { startPhase, createNextPhaseThread } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
```

Add inside the component:
```typescript
const queryClient = useQueryClient();
```

- [ ] **Step 2: Add "Start Learning" button after plan_card messages**

In the `messages.map` block, modify the `plan_card` rendering (around line 221-228):

```tsx
          if (msg.type === "plan_card") {
            return (
              <React.Fragment key={msg.id}>
                <PlanCreatedCard topicSlug={msg.metadata?.topicSlug ?? ""} />
                {/* Show Start button only if this is the last message group */}
                {index === messages.length - 1 && thread?.phase === "planning" && (
                  <PhaseActionButton
                    label="Start Learning"
                    sublabel="Begin Phase 1 of your learning plan"
                    onClick={async () => {
                      const result = await startPhase(threadId);
                      queryClient.invalidateQueries({ queryKey: ["threads"] });
                      queryClient.invalidateQueries({ queryKey: ["thread-tree"] });
                      router.push(`/threads/${result.thread_id}`);
                    }}
                  />
                )}
              </React.Fragment>
            );
          }
```

- [ ] **Step 3: Commit**

```bash
git add "client/app/threads/[threadId]/page.tsx"
git commit -m "feat: show Start Learning button after plan creation"
```

### Task 12: Add "Continue to Next Phase" button after phase completion

**Files:**
- Modify: `client/app/threads/[threadId]/page.tsx`

- [ ] **Step 1: Wire phaseComplete state from useChat**

Add `phaseComplete` and `dismissPhaseComplete` to the useChat destructuring:

```typescript
  const {
    // ...existing...
    phaseComplete,
    dismissPhaseComplete,
  } = useChat({
    threadId,
    onPlanCreated: (slug) => setTopicSlug(slug),
  });
```

- [ ] **Step 2: Show "Continue to Next Phase" button**

After the `branchSuggestion` card rendering (around line 273), add:

```tsx
        {phaseComplete && !phaseComplete.isFinalPhase && !feynmanOpen && (
          <PhaseActionButton
            label="Continue to Next Phase"
            sublabel={`You've completed ${phaseComplete.phaseTitle}! Up next: ${phaseComplete.nextPhaseTitle}`}
            onClick={async () => {
              const result = await createNextPhaseThread(threadId);
              if (result.error) return;
              dismissPhaseComplete();
              queryClient.invalidateQueries({ queryKey: ["threads"] });
              queryClient.invalidateQueries({ queryKey: ["thread-tree"] });
              router.push(`/threads/${result.thread_id}`);
            }}
          />
        )}
        {phaseComplete && phaseComplete.isFinalPhase && !feynmanOpen && (
          <PhaseActionButton
            label="View Results"
            sublabel={`Congratulations! You've completed all phases of your learning plan.`}
            onClick={async () => {
              router.push(`/threads`);
            }}
          />
        )}
```

- [ ] **Step 3: Pass `onSubmitComplete` to FeynmanModal**

Update the `FeynmanModal` rendering (around line 335-341) to pass the callback. The `phaseComplete` state is only set after the Feynman modal is triggered, so the "Continue" button will appear after the user completes the Feynman test and closes the modal:

```tsx
      {feynmanOpen && feynmanConcept && (
        <FeynmanModal
          threadId={threadId}
          conceptName={feynmanConcept}
          onClose={dismissFeynman}
          onSubmitComplete={() => {
            // phaseComplete state is already set from SSE — it will render
            // the "Continue to Next Phase" button after modal closes
          }}
        />
      )}
```

- [ ] **Step 4: Commit**

```bash
git add "client/app/threads/[threadId]/page.tsx"
git commit -m "feat: show Continue to Next Phase button after Feynman test completion"
```

### Task 13: Handle planning → teaching transition for "Start" button

**Files:**
- Modify: `client/hooks/use-chat.ts`

Currently the plan approval words trigger `planning → teaching` in chat.py. With the new flow, we skip that — the `start_phase` endpoint handles the transition. But we need the frontend to know when a plan exists so the "Start" button renders correctly.

- [ ] **Step 1: Ensure `phase` reflects thread state on load**

In `use-chat.ts`, update the `useQuery` for loading messages to also set phase from the thread:

After the existing `useQuery` block (around line 153), the `phase` should be initialized from the thread. Since `useThread` is called in the page component, we need to pass the phase down.

Actually, this is simpler: the page component already has `thread?.phase`. The "Start Learning" button checks `thread?.phase === "planning"` — no hook changes needed.

- [ ] **Step 2: Verify no regressions by reviewing the flow**

The flow is:
1. Root thread: interview → `create_plan` → phase changes to `planning` → plan_card renders → "Start Learning" button shows
2. Click "Start Learning" → `POST /threads/{id}/start-phase` → creates child thread, transitions root to `teaching` → redirects to child thread
3. Child thread: teaching → agent teaches → `update_plan_progress` → auto Feynman → scores → if last in phase → "Continue to Next Phase"
4. Click "Continue" → `POST /threads/{id}/next-phase` → creates sibling → redirects

- [ ] **Step 3: Commit (if any changes were needed)**

No commit needed if no code changes. This step is verification only.

---

## Chunk 6: Integration testing

### Task 14: Manual integration test

- [ ] **Step 1: Start backend**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run uvicorn main:app --reload --port 8000`

- [ ] **Step 2: Start frontend**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm dev`

- [ ] **Step 3: Test the full flow**

1. Create a new thread, send "I want to learn Python basics"
2. Answer interview questions
3. Wait for plan creation → verify "Start Learning" button appears
4. Click "Start Learning" → verify redirect to Phase 1 child thread
5. Chat with the agent, let it teach a concept
6. When agent calls `update_plan_progress` → verify Feynman modal auto-opens
7. Write an explanation and submit → verify scores appear in modal
8. Click "Continue" to close modal
9. After last concept in phase → verify "Continue to Next Phase" button
10. Click it → verify redirect to Phase 2 sibling thread with context

- [ ] **Step 4: Verify thread tree structure**

Check `GET /api/threads/tree` — verify Phase 1 and Phase 2 are siblings (both depth=1, both children of root).

- [ ] **Step 5: Final commit if any fixes needed**
