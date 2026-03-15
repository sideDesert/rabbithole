# Study Plans Page Redesign

## Overview

Redesign `/study-plans` from a simple thread list into an interactive topic hub with plan progress, mastery placeholders, thread trees, and search. Uses a grid-to-detail transition pattern.

## Current State

The page is a server component that fetches all threads via `listThreads()`, filters to root threads, and renders them as basic `ThreadCard` components in a 2-column grid. No search, no plan visibility, no thread hierarchy.

## Design

### Grid View (Default)

- **Client component** using `useStudyTopics()` hook (existing) to fetch topics
- **Search input** at top — filters topics by name, client-side, instant. When the query matches zero topics, show "No topics match your search" (distinct from the general empty state)
- **Loading state:** skeleton cards (3 placeholder cards with pulsing gradient headers)
- **Responsive grid** (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) of topic cards
- Each card is a **new `StudyPlanCard` component** that reuses the visual design from `StudyTopicCard` (gradient header, progress ring, topic title, phase badge, current concept, time ago) but replaces the `<Link>` wrapper with an `onClick` handler. The existing `StudyTopicCard` is not modified — it continues to work as-is elsewhere. The "Continue" button is removed from the grid card since clicking the card opens the detail view (which has its own Continue button).
- **Empty state:** "No study plans yet. Start a conversation to create one."
- Clicking a card sets `selectedTopic` state, transitioning to the detail view

### Detail View (Expanded)

When a topic card is clicked, the grid is replaced by a detail view for that topic.

**Header:**
- Back button ("← All Study Plans") — clears `selectedTopic`, returns to grid
- Topic name (large heading)
- Phase badge
- Progress ring (reused `ProgressRing` component extracted from `TopicProgress`)
- "Continue" button linking to the topic's latest thread (`topic.latest_thread.id`)

**Plan Progress (main section):**
- Extracts the `PhaseGroup` rendering logic from `TopicProgress` into a standalone component (the existing `TopicProgress` is tightly coupled to `PlanProvider` context — we extract the presentation layer only)
- Phases shown as collapsible groups
- Each phase has concept rows: check icon (completed), circle (pending), highlight (current)
- Per-phase counts: `X/Y concepts`
- Data fetched via `getProgress(topic.root_thread_id)` — uses the **root thread ID** since the plan is scoped to the root topic
- **No-plan state:** If `getProgress()` returns no phases (e.g., topic still in interview phase), show "Plan not yet created. Complete the interview to generate a study plan."
- **Loading state:** skeleton lines for phase groups
- **Error state:** "Failed to load plan progress" with retry button

**Mastery & Tests (placeholder):**
- Section titled "Tests"
- Muted placeholder message: "Mastery tests coming soon. You'll be able to track Feynman test scores for each concept here."
- Styled as a subtle bordered box — clearly a future slot

**Thread Tree:**
- Section titled "Conversations"
- Thread hierarchy using `react-arborist` (same pattern as sidebar `ThreadTree`)
- Data fetched via `fetchThreadTrees()`, then client-side extract the single tree node matching `topic.root_thread_id` (produces a rooted subtree, not a filtered array)
- Clicking a thread navigates to `/threads/{id}`
- **Loading state:** skeleton tree lines
- **Empty state:** "No conversations yet" (shouldn't normally happen since a topic implies at least one thread)

## Component Structure

```
StudyPlansPage (client)
├── SearchInput (controlled, filters topics by name)
├── TopicGrid (shown when selectedTopic is null)
│   └── StudyPlanCard (new — visual clone of StudyTopicCard, onClick instead of Link)
└── TopicDetail (shown when selectedTopic is set)
    ├── DetailHeader (topic name, phase badge, progress ring, continue button)
    ├── PlanProgress (extracted PhaseGroup pattern, fetches via root_thread_id)
    ├── MasteryPlaceholder (static placeholder box)
    └── TopicThreadTree (react-arborist tree, extracted subtree for this topic's root)
```

## State Management

- `selectedTopic: StudyTopic | null` — drives grid ↔ detail toggle (component state, not URL-driven; deep linking can be added later)
- `query: string` — search input, filters topics client-side by name match

## Data Fetching

| View | Hook / Function | Endpoint | Notes |
|------|----------------|----------|-------|
| Grid | `useStudyTopics()` | `GET /api/threads/study-topics` | Existing hook |
| Detail — plan | `useQuery(['progress', rootThreadId], () => getProgress(rootThreadId))` | `GET /api/threads/{id}/progress` | Uses `topic.root_thread_id` |
| Detail — threads | `useThreadTree()` | `GET /api/threads/tree` | Client-side filter to extract subtree for `root_thread_id` |

No new API endpoints required. All data is served by existing backend routes.

## File Organization

New files in `client/app/study-plans/`:
- `page.tsx` — rewritten as client component with search + grid/detail toggle
- `study-plan-card.tsx` — grid card (visual clone of StudyTopicCard, onClick behavior)
- `topic-detail.tsx` — detail view component (header, plan, mastery, threads)

Reuses existing:
- Visual design from `StudyTopicCard` (gradient logic, progress ring SVG, phase labels, time formatting)
- `PhaseGroup` rendering pattern from `TopicProgress` (extracted, not wrapped in PlanProvider)
- `ThreadTree` pattern from `client/components/thread-tree.tsx`
- `useStudyTopics` from `client/hooks/use-study-topics.ts`
- `useThreadTree` from `client/hooks/use-thread-tree.ts`

## Out of Scope

- Mastery scoring / Feynman test wiring (placeholder only)
- Animations for grid-to-detail transition (can be added later)
- Drag-and-drop reordering of topics
- Topic deletion from this page
- URL-driven selected topic (query params / dynamic route — can be added later)
- Mini segmented progress bar per phase on grid cards (requires API change to include per-phase data in StudyTopic response — deferred to v2)
