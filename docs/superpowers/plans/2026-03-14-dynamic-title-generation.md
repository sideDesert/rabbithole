# Dynamic Thread Title Generation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate concise, LLM-powered thread titles after the first response, and plan-based titles after plan creation, streamed to the frontend via SSE.

**Architecture:** Add a `generate_thread_title()` async helper that makes a short LLM call. Invoke it inline in the SSE stream after the first response (root threads only). On plan creation, extract the topic name from the parsed plan. Both emit a `title_update` SSE event. Frontend handles the event by invalidating TanStack Query caches.

**Tech Stack:** Python/FastAPI (backend), OpenAI client (title LLM call), TypeScript/React/TanStack Query (frontend)

**Spec:** `docs/superpowers/specs/2026-03-14-dynamic-title-generation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/api/chat.py` | Modify | Add prompt, helper, two trigger points in stream, fold title into step 13 update |
| `backend/tests/test_title_generation.py` | Create | Unit tests for `generate_thread_title` and post-processing |
| `client/lib/api.ts` | Modify | Add `title_update` to `SSEEvent` type union |
| `client/hooks/use-chat.ts` | Modify | Handle `title_update` SSE event |

---

## Chunk 1: Backend — Title Generation Helper

### Task 1: Add `generate_thread_title` helper and prompt

**Files:**
- Modify: `backend/app/api/chat.py:220-228` (after `COMPACTION_PROMPT`)
- Create: `backend/tests/test_title_generation.py`

- [ ] **Step 1: Write failing tests for title post-processing**

Create `backend/tests/test_title_generation.py`:

```python
"""Tests for thread title generation helpers."""

from app.api.chat import clean_title


def test_clean_title_strips_quotes():
    assert clean_title('"Quantum Mechanics Basics"') == "Quantum Mechanics Basics"


def test_clean_title_strips_single_quotes():
    assert clean_title("'Quantum Mechanics Basics'") == "Quantum Mechanics Basics"


def test_clean_title_strips_trailing_period():
    assert clean_title("Quantum Mechanics Basics.") == "Quantum Mechanics Basics"


def test_clean_title_caps_at_80_chars():
    long = "A" * 100
    assert len(clean_title(long)) == 80


def test_clean_title_strips_and_caps():
    long = '"' + "A" * 100 + '".'
    result = clean_title(long)
    assert len(result) == 80
    assert not result.startswith('"')


def test_clean_title_preserves_normal_title():
    assert clean_title("Learning Python Basics") == "Learning Python Basics"


def test_clean_title_handles_empty():
    assert clean_title("") == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest tests/test_title_generation.py -v`
Expected: FAIL with `ImportError: cannot import name 'clean_title'`

- [ ] **Step 3: Add `TITLE_GENERATION_PROMPT`, `clean_title`, and `generate_thread_title` to `chat.py`**

In `backend/app/api/chat.py`, after the `COMPACTION_PROMPT` block (line 228), add:

```python
TITLE_GENERATION_PROMPT = """\
Generate a concise title (4-8 words) for this learning conversation. \
Return ONLY the title, no quotes or punctuation wrapping."""


def clean_title(raw: str) -> str:
    """Strip quotes, trailing periods, and cap at 80 chars."""
    title = raw.strip().strip("\"'`").rstrip(".")
    return title[:80]


async def generate_thread_title(user_msg: str, assistant_msg: str) -> str:
    """Generate a concise thread title from the first exchange."""
    try:
        response = await llm.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": TITLE_GENERATION_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"User: {user_msg[:300]}\n\n"
                        f"Assistant: {assistant_msg[:300]}"
                    ),
                },
            ],
            max_tokens=30,
        )
        raw = response.choices[0].message.content or ""
        title = clean_title(raw)
        return title if title else user_msg[:100]
    except Exception as e:
        logger.warning("[chat] title generation failed: %s", e)
        return user_msg[:100]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest tests/test_title_generation.py -v`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend
git add app/api/chat.py tests/test_title_generation.py
git commit -m "feat: add title generation helper and prompt"
```

---

## Chunk 2: Backend — Wire Triggers Into SSE Stream

### Task 2: Add title generation triggers in the stream function

**Files:**
- Modify: `backend/app/api/chat.py:879-981` (steps 9-13 in the stream function)

**Context:** The stream function has numbered steps. We need to:
1. Track whether to generate a title (variable `new_title`)
2. After step 9 (save response): if first message on root thread, call `generate_thread_title`
3. In step 11 (plan creation): extract topic from plan, set as title
4. Emit `title_update` SSE event after either trigger
5. Fold the title update into step 13's existing `update_one`

- [ ] **Step 1: Add `is_first_message` and `new_title` variables**

In `chat.py`, after line 775 (`new_topic_slug = ""`), add:

```python
        is_first_message = len(history) == 0 and not thread.get("parent_thread_id")
        new_title = ""
```

- [ ] **Step 2: Add title generation after step 9 (save response)**

After step 9's `yield _status(...)` on line 879, add:

```python
        # 9b. Generate title on first message (root threads only)
        if is_first_message and full_text:
            t0 = time.perf_counter()
            new_title = await generate_thread_title(req.content, full_text)
            logger.info("[chat] title generated: %r — %dms", new_title, _ms(t0))
```

- [ ] **Step 3: Add plan-based title in step 11 (plan creation)**

In the existing `if new_topic_slug:` block (line 908), after the `yield sse({"type": "plan_created", ...})` on line 927, add:

```python
            # Update title to plan topic name
            if not thread.get("parent_thread_id"):
                plan_path = PLANS_DIR / new_topic_slug / "plan.md"
                if plan_path.exists():
                    tree = parse_plan(plan_path.read_text())
                    if tree.topic:
                        new_title = tree.topic
                        logger.info("[chat] title from plan: %r", new_title)
```

- [ ] **Step 4: Emit `title_update` SSE event and fold into step 13 update**

Before step 13's `update_one` call (line 971), add the SSE event:

```python
        # Emit title update if generated
        if new_title:
            yield sse({"type": "title_update", "title": new_title})
```

Then modify step 13's `update_one` to conditionally include the title in the `$set`:

Replace lines 971-981:
```python
        run_input_tokens = sum(r.usage.input_tokens for r in result.raw_responses)
        run_output_tokens = sum(r.usage.output_tokens for r in result.raw_responses)
        run_total_tokens = sum(r.usage.total_tokens for r in result.raw_responses)
        update_set: dict[str, object] = {"updated_at": utcnow()}
        if new_title:
            update_set["title"] = new_title
        _ = mongo.threads().update_one(
            {"_id": thread_id},
            {
                "$set": update_set,
                "$inc": {
                    "token_usage.input_tokens": run_input_tokens,
                    "token_usage.output_tokens": run_output_tokens,
                    "token_usage.total_tokens": run_total_tokens,
                },
            },
        )
```

- [ ] **Step 5: Commit**

```bash
cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend
git add app/api/chat.py
git commit -m "feat: wire title generation triggers into SSE stream"
```

---

## Chunk 3: Frontend — Handle `title_update` SSE Event

### Task 3: Add `title_update` to SSEEvent type and handle in use-chat

**Files:**
- Modify: `client/lib/api.ts:17-29` (SSEEvent type)
- Modify: `client/hooks/use-chat.ts:199-350` (SSE switch statement)

- [ ] **Step 1: Add `title_update` to SSEEvent type**

In `client/lib/api.ts`, add to the `SSEEvent` union (after line 28, before the `error` case):

```typescript
  | { type: "title_update"; title: string }
```

- [ ] **Step 2: Handle `title_update` in use-chat SSE switch**

In `client/hooks/use-chat.ts`, add a new case in the `switch (event.type)` block (after the `plan_created` case, before `end`):

```typescript
          case "title_update":
            queryClient.invalidateQueries({ queryKey: ["threads"] });
            queryClient.invalidateQueries({ queryKey: ["thread-tree"] });
            break;
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build`
Expected: build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client
git add lib/api.ts hooks/use-chat.ts
git commit -m "feat: handle title_update SSE event in frontend"
```

---

## Chunk 4: Manual Integration Test

### Task 4: End-to-end verification

- [ ] **Step 1: Start backend and frontend**

```bash
cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run uvicorn main:app --reload --port 8000 &
cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm dev &
```

- [ ] **Step 2: Test first-message title generation**

1. Open http://localhost:3000
2. Create a new thread with message "I want to learn about quantum mechanics"
3. After the assistant responds, verify:
   - The thread title in the sidebar updates from "I want to learn about quantum mechanics" to a concise 4-8 word title
   - Check backend logs for `[chat] title generated:` entry

- [ ] **Step 3: Test plan-based title generation**

1. Continue the conversation through the interview phase until a plan is created
2. After plan creation, verify:
   - The thread title updates to the plan's topic name
   - Check backend logs for `[chat] title from plan:` entry

- [ ] **Step 4: Test branch thread is unaffected**

1. Branch from an assistant message
2. Verify the branch thread title is generated by `_compact_branch_summary`, not the new title generation logic

- [ ] **Step 5: Run all backend tests**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/backend && uv run pytest -v`
Expected: all tests pass
