# Branch Annotations Design

## Summary

Show inline annotations on assistant messages where the user previously branched into a sub-topic. Annotated text is underlined; hovering shows the branch title; clicking navigates to the branch thread.

## Requirements

- Underline text ranges in assistant messages that have associated branches
- Hover tooltip shows the branch title (e.g., "How does TCP handshake work?")
- Click navigates to `/threads/{branch.thread_id}`
- Skip branches without valid position data (`position === null`)
- Do not annotate messages that are currently streaming

## Approach: DOM Post-Processing

Position offsets stored on branches were computed from rendered DOM text (via `use-text-selection-menu.ts`'s `preRange.toString().length`). The offset domain is all text content within the `[data-message-id]` article element as rendered in its final (non-streaming) state. Matching them against rendered DOM text is the most reliable strategy.

After Streamdown renders a message, walk the DOM to find text at the stored offsets and wrap it in annotation elements.

## Pre-requisite: Fix `position` data shape

The backend `TextPosition` model stores `{"start": N, "end": N}` (a dict), but the frontend `Branch` interface declares `position: number[] | null`. Update the frontend type to match:

```typescript
// in client/lib/api.ts
export interface Branch {
  // ...
  position: { start: number; end: number } | null;
}
```

Use `position.start` / `position.end` throughout the annotation logic.

## Data Flow

1. Thread page calls `useBranches(threadId)` to fetch all branches for the current thread
2. Filter branches to only those with non-null `position`
3. Group branches by `message_id` into a `Map<string, Branch[]>`
4. Pass the per-message annotation list to `ChatMessage` via a new `annotations` prop
5. `ChatMessage` applies annotations after Streamdown renders (via `useEffect`)

## ChatMessage Changes

### New prop

```typescript
annotations?: Branch[]
```

### Annotation logic (useEffect)

When `annotations` is non-empty and the message is not streaming:

1. Get the message's DOM element via `data-message-id` attribute
2. Sort annotations by `position.start` **descending** — process last-to-first so earlier offsets remain valid as later ones are wrapped
3. For each annotation, use a `TreeWalker` (filtering to `NodeFilter.SHOW_TEXT`) to accumulate character offsets and find the text nodes spanning `[position.start, position.end]`
4. Use `Range` to select the target text. Since the range may span across inline elements (bold, code, links), use `range.extractContents()` to get a DocumentFragment, wrap it in the `<a>` element, and insert back via `range.insertNode()`:
   - `className = "branch-annotation"`
   - `href = "/threads/{branch.thread_id}"`
   - `title = "{branch.title}"`
   - `data-branch-id = "{branch.branch_point_id}"`
5. Use event delegation: a single click handler on the message container that checks `e.target.closest('.branch-annotation')` — avoids per-element listener management
6. Cleanup function on unmount/re-render: unwrap all `.branch-annotation` elements (replace with their child nodes) to avoid stale marks

### Guard conditions

- Skip if `annotations` is empty or undefined
- Skip if message is currently streaming (`isLast && streaming`)
- Re-run when `annotations` or `content` changes

## Styling

Add to `globals.css`:

```css
.branch-annotation {
  text-decoration: underline dotted;
  text-decoration-color: var(--accent);
  text-underline-offset: 3px;
  cursor: pointer;
  transition: background-color 0.15s;
}
.branch-annotation:hover {
  background-color: hsl(var(--accent) / 0.15);
  border-radius: 2px;
}
```

## Thread Page Changes

- Import and call `useBranches(threadId)`
- Build a `Map<string, Branch[]>` grouping branches by `message_id`, filtering out null positions
- Pass the relevant branches array to each `ChatMessage` via the `annotations` prop

## Files to modify

| File | Change |
|------|--------|
| `client/lib/api.ts` | Fix `Branch.position` type to `{ start: number; end: number } | null` |
| `client/app/threads/[threadId]/page.tsx` | Call `useBranches`, build annotation map, pass to `ChatMessage` |
| `client/components/chat-message.tsx` | Accept `annotations` prop, `useEffect` for DOM annotation with event delegation |
| `client/app/globals.css` | Add `.branch-annotation` styles |

## Edge Cases

- **Overlapping annotations**: If two branches annotate overlapping text ranges, apply only the first one (by position start) and skip overlapping ones
- **Offset mismatch**: If the stored position extends beyond the message's rendered text length, skip that annotation silently
- **Streaming messages**: Never annotate the last message while streaming — wait until streaming completes
- **Cross-element ranges**: Use `range.extractContents()` + `range.insertNode()` instead of `range.surroundContents()` to handle annotations that span across inline formatting elements (bold, code, links)
- **React re-renders**: Streamdown content is stable once finalized (not streaming), so re-renders are unlikely. The cleanup function handles the case where they do occur.
