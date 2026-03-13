# Topic Progress Widget — Design Spec

## Overview

A compact progress widget in the top bar that shows the current learning plan's topic name alongside a circular progress ring. Hovering or clicking the widget reveals a dropdown listing all phases and concepts with completion status.

## Placement

Sits in the top bar's left section, between the sidebar trigger and the centered agent pill:

```
[SidebarTrigger] [TopicProgress: "Topic Name" ◐] ... [AgentPill centered] ... [Tabs] [Theme]
```

Rendered as a flex child inside the existing left `div` in `TopBar`.

## Visibility

Only renders when plan data exists (i.e., `getProgress()` returns phases). During interview/planning phases with no plan yet, renders nothing. Also renders nothing during loading and error states to avoid layout shift.

## Prerequisites

- `TopicProgress` calls `usePlan()` to get `threadId`. This requires `PlanProvider` to be an ancestor in the component tree. Currently satisfied: `MainContent` (which renders `TopBar`) is wrapped by `PlanProvider` in the layout.
- `threadId` is set by the thread page via `setThreadId(threadId)` in a `useEffect`. When the user navigates to a different thread, the route param changes, and the thread page calls `setThreadId` with the new value, which triggers a re-render of `TopicProgress` with fresh data.

## Component: `TopicProgress`

**File:** `client/components/topic-progress.tsx`

Self-contained component. No props required — reads `threadId` from `usePlan()` context and fetches progress via TanStack Query.

### Circular Progress Ring

- CSS-based using `conic-gradient` on a div with a circular mask
- ~20px diameter
- Track: `muted` color, arc: `primary` color
- Represents `overall_progress` (0.0–1.0) across all phases
- Smooth CSS transition when progress updates
- States: empty ring at 0%, proportional arc fill, full ring at 100%
- Note: if conic-gradient aliasing is noticeable at this size during implementation, fall back to SVG `stroke-dasharray`

### Topic Label

- Displays `data.topic` from the progress response
- Truncated with ellipsis if too long (max-width constraint)
- Styled as a small, medium-weight label

### Dropdown

**Trigger behavior:**

- **Hover:** Opens on `mouseenter` after ~150ms delay. Closes on `mouseleave` after ~300ms delay (allows mouse to travel into the dropdown).
- **Click:** Toggles a "pinned" state. When pinned, dropdown stays open regardless of mouse. Clicking trigger again or clicking outside unpins and closes.
- **Keyboard:** Trigger is a `button` element. Enter/Space toggle pinned state. Escape closes the dropdown.
- **Open state:** Derived as `isHovered || isPinned`.
- Hover timers managed via refs.

**Content:**

- Phases listed vertically as group headers showing phase title + "X/Y completed" count
- All phases expanded (no accordion — this is a quick-glance overview)
- Under each phase: concept list with check icons for completed, empty circles for upcoming
- Completed concepts: muted color + strikethrough
- Current concept (from `data.current_concept`): subtle highlight
- Max height with `overflow-y: auto` for long plans

**Position:** Anchored below the trigger, left-aligned. Standard popover drop shadow and border. Dropdown must use `z-30` or higher to render above the top bar's `z-20` and the absolutely-positioned `AgentPill`.

**Animation:** Fade in + slight translateY (150ms) on open/close for polish.

## Data Flow

- **Query:** `useQuery({ queryKey: ["progress", threadId], queryFn: () => getProgress(threadId!), enabled: !!threadId })`
- The `enabled: !!threadId` guard prevents firing the query when `threadId` is null (e.g., on the home page or before navigation completes)
- Shares cache with `PlanView` via identical query key — no duplicate network requests
- `threadId` sourced from `usePlan()` context (set by the thread page on mount and navigation)

**Loading/error behavior:** Render nothing. The widget only appears once data is successfully loaded with phases present. This avoids layout shift and keeps the top bar clean.

**Internal state:**

| State | Type | Purpose |
|-------|------|---------|
| `isHovered` | boolean | Mouse is over trigger or dropdown |
| `isPinned` | boolean | User clicked to lock open |
| `isOpen` | derived | `isHovered \|\| isPinned` |
| hover timers | refs | Enter/leave delay management |

## Files Changed

| File | Change |
|------|--------|
| `client/components/topic-progress.tsx` | New file — the widget component |
| `client/components/top-bar.tsx` | Import and render `TopicProgress` in the left section |

## Styling

- Uses existing CSS variables (`--primary`, `--muted`, `--muted-foreground`, `--border`, `--background`, `--foreground`)
- Tailwind classes for layout and spacing
- Dropdown shadow and border consistent with existing popover patterns in the app
