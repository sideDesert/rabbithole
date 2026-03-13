# Branch Annotations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show inline annotations (underline + hover tooltip + click-to-navigate) on assistant messages where the user previously branched into a sub-topic.

**Architecture:** DOM post-processing approach. After Streamdown renders each message, a `useEffect` walks the DOM using TreeWalker to find text at stored position offsets and wraps matching ranges in `<a>` elements. Event delegation handles clicks for client-side navigation.

**Tech Stack:** React, Next.js router, DOM TreeWalker/Range APIs, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-13-branch-annotations-design.md`

---

## Chunk 1: Fix Branch type + add annotation styles

### Task 1: Fix `Branch.position` type in api.ts

**Files:**
- Modify: `client/lib/api.ts:217`

- [ ] **Step 1: Update the Branch interface position type**

Change `position: number[] | null` to `position: { start: number; end: number } | null` to match the backend `TextPosition` model which returns `{"start": N, "end": N}`.

```typescript
// in the Branch interface
position: { start: number; end: number } | null;
```

- [ ] **Step 2: Verify no other code references `position` as an array**

Run: `cd client && grep -r "position\[" hooks/use-branch.ts lib/api.ts components/chat-message.tsx app/threads/`

Expected: No matches (the position field isn't indexed into anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add client/lib/api.ts
git commit -m "fix: update Branch.position type to match backend TextPosition shape"
```

### Task 2: Add annotation CSS styles

**Files:**
- Modify: `client/app/globals.css`

- [ ] **Step 1: Add `.branch-annotation` styles at the end of globals.css**

After the `@keyframes highlight-fade` block (line ~149), add:

```css
.branch-annotation {
  text-decoration: underline dotted;
  text-decoration-color: var(--primary);
  text-underline-offset: 3px;
  cursor: pointer;
  transition: background-color 0.15s;
  color: inherit;
}
.branch-annotation:hover {
  background-color: oklch(from var(--primary) l c h / 0.15);
  border-radius: 2px;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/app/globals.css
git commit -m "style: add branch annotation underline and hover styles"
```

---

## Chunk 2: Annotation DOM logic in ChatMessage

### Task 3: Create the `useAnnotations` hook

**Files:**
- Create: `client/hooks/use-annotations.ts`

This hook encapsulates all DOM manipulation logic. It takes a ref to the message element and the annotations array, and applies/cleans up annotation wrappers.

- [ ] **Step 1: Create `client/hooks/use-annotations.ts`**

```typescript
"use client";

import type { Branch } from "@/lib/api";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Walks text nodes in `container` to find the node and offset
 * corresponding to `targetOffset` characters from the start.
 */
function findTextPosition(
  container: HTMLElement,
  targetOffset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  let accumulated = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent?.length ?? 0;
    if (accumulated + len > targetOffset) {
      return { node, offset: targetOffset - accumulated };
    }
    accumulated += len;
  }
  return null;
}

/**
 * Remove all annotation wrappers from the container,
 * replacing each <a class="branch-annotation"> with its child nodes.
 */
function clearAnnotations(container: HTMLElement) {
  const marks = container.querySelectorAll("a.branch-annotation");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

export function useAnnotations(
  messageRef: React.RefObject<HTMLElement | null>,
  annotations: Branch[] | undefined,
  isStreaming: boolean,
) {
  const router = useRouter();

  useEffect(() => {
    const el = messageRef.current;
    if (!el || !annotations?.length || isStreaming) return;

    // Sort descending by position.start so DOM mutations
    // don't invalidate earlier offsets
    const sorted = annotations
      .filter((a): a is Branch & { position: NonNullable<Branch["position"]> } =>
        a.position !== null,
      )
      .sort((a, b) => b.position.start - a.position.start);

    if (sorted.length === 0) return;

    // Apply annotations
    for (const annotation of sorted) {
      const { start, end } = annotation.position;

      const startPos = findTextPosition(el, start);
      const endPos = findTextPosition(el, end);
      if (!startPos || !endPos) continue;

      try {
        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);

        const link = document.createElement("a");
        link.className = "branch-annotation";
        link.href = `/threads/${annotation.thread_id}`;
        link.title = annotation.title;
        link.dataset.branchId = annotation.branch_point_id;

        // extractContents handles cross-element ranges
        const fragment = range.extractContents();
        link.appendChild(fragment);
        range.insertNode(link);
      } catch {
        // Skip annotations that can't be applied (offset mismatch, etc.)
      }
    }

    // Event delegation for click handling
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.("a.branch-annotation");
      if (target instanceof HTMLAnchorElement) {
        e.preventDefault();
        const href = target.getAttribute("href");
        if (href) router.push(href);
      }
    };
    el.addEventListener("click", handleClick);

    return () => {
      el.removeEventListener("click", handleClick);
      clearAnnotations(el);
    };
  }, [messageRef, annotations, isStreaming, router]);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/hooks/use-annotations.ts
git commit -m "feat: add useAnnotations hook for DOM-based branch annotation"
```

### Task 4: Wire annotations into ChatMessage

**Files:**
- Modify: `client/components/chat-message.tsx`

- [ ] **Step 1: Add annotations prop and useAnnotations hook to ChatMessage**

Add imports at the top:

```typescript
import { useRef } from "react";
import type { Branch } from "@/lib/api";
import { useAnnotations } from "@/hooks/use-annotations";
```

Add to the `ChatMessageInterface`:

```typescript
annotations?: Branch[];
```

Inside the `ChatMessage` function body (before the `if (role === ROLE_USER)` check), add:

```typescript
const articleRef = useRef<HTMLElement | null>(null);
useAnnotations(
  articleRef,
  role === ROLE_AI ? annotations : undefined,
  !!(isLast && /* streaming detection — see step 2 */),
);
```

- [ ] **Step 2: Merge the existing ref callback with the new articleRef**

The AI message `<article>` currently uses an inline `ref` callback for `lastMessageRef`. Merge both refs:

```typescript
ref={(el) => {
  articleRef.current = el;
  if (!el) return;
  if (isLast) {
    lastMessageRef(id)(el);
  } else {
    el.style.minHeight = "";
  }
}}
```

The `isStreaming` guard for useAnnotations: `ChatMessage` doesn't currently have a `streaming` prop (it was removed). Since annotations only matter for finalized messages, pass `!!isLast` as a conservative guard — the last message might still be streaming. A more precise approach: add an optional `streaming` prop back, or rely on the fact that annotations won't exist for messages that are still being streamed (they're created from completed messages).

Use `!!isLast` as the guard:

```typescript
useAnnotations(articleRef, role === ROLE_AI ? annotations : undefined, !!isLast);
```

This is slightly over-conservative (it won't annotate the last message even when it's done streaming), but it's safe and simple. The annotations will appear once a new message is sent (moving the annotated message to a non-last position). This is acceptable because users branch from historical messages, not the latest one.

- [ ] **Step 3: Commit**

```bash
git add client/components/chat-message.tsx
git commit -m "feat: wire useAnnotations hook into ChatMessage component"
```

---

## Chunk 3: Wire useBranches into the thread page

### Task 5: Pass annotations from thread page to ChatMessage

**Files:**
- Modify: `client/app/threads/[threadId]/page.tsx`

- [ ] **Step 1: Import useBranches and build annotation map**

Add import:

```typescript
import { useBranches } from "@/hooks/use-branch";
```

After the `useBranchout` call (~line 114), add:

```typescript
const { data: branchData } = useBranches(threadId);
const annotationsByMessage = React.useMemo(() => {
  const map = new Map<string, Branch[]>();
  if (!branchData?.branches) return map;
  for (const branch of branchData.branches) {
    if (!branch.position) continue;
    const existing = map.get(branch.message_id) ?? [];
    existing.push(branch);
    map.set(branch.message_id, existing);
  }
  return map;
}, [branchData]);
```

Also add the `Branch` type import:

```typescript
import { useBranches } from "@/hooks/use-branch";
import type { Branch } from "@/lib/api";
```

- [ ] **Step 2: Pass annotations to ChatMessage**

In the `<ChatMessage>` JSX (~line 155), add the `annotations` prop:

```typescript
<ChatMessage
  key={msg.id}
  id={msg.id}
  role={msg.role as typeof ROLE_USER | typeof ROLE_AI}
  content={msg.content}
  className={`${msg.role === ROLE_USER && "w-fit self-end"}`}
  isLast={messages.length - 1 === index}
  trailSteps={msg.trailSteps}
  trailCollapsed={msg.trailCollapsed}
  onTrailToggle={() => toggleTrailCollapsed(msg.id)}
  annotations={annotationsByMessage.get(msg.id)}
/>
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd client && pnpm build`

Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add client/app/threads/[threadId]/page.tsx
git commit -m "feat: wire branch annotations into thread page"
```

---

## Chunk 4: Manual testing

### Task 6: End-to-end manual test

- [ ] **Step 1: Start the dev servers**

Run: `cd backend && uv run uvicorn main:app --reload --port 8000` and `cd client && pnpm dev`

- [ ] **Step 2: Test with existing branches**

1. Open a thread that has existing branches (created via text selection → branch)
2. Verify annotated text appears with dotted underline
3. Hover over annotation — verify the branch title appears as a tooltip
4. Click the annotation — verify navigation to `/threads/{branch_thread_id}`

- [ ] **Step 3: Test creating a new branch and seeing the annotation**

1. In a thread, select text from an assistant message and click "Branch"
2. Enter a title and submit
3. Navigate back to the parent thread
4. Verify the new annotation appears on the text that was branched from

- [ ] **Step 4: Test edge cases**

1. Verify messages without branches render normally (no visual change)
2. Verify user messages are not annotated
3. Verify the last message (potentially streaming) is not annotated
