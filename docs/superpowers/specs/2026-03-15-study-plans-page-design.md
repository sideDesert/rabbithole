# Study Plans Page Redesign

## Overview

Redesign `/study-plans` from a simple thread list into an interactive topic hub with plan progress, mastery placeholders, thread trees, and search. Uses a grid-to-detail transition pattern.

## Current State

The page is a server component that fetches all threads via `listThreads()`, filters to root threads, and renders them as basic `ThreadCard` components in a 2-column grid. No search, no plan visibility, no thread hierarchy.

## Design

### Grid View (Default)

- **Client component** using `useStudyTopics()` hook (existing) to fetch topics
- **Search input** at top — filters topics by name, client-side, instant
- **Responsive grid** (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) of enriched topic cards
- Each card reuses the `StudyTopicCard` design: gradient header, progress ring, topic title, phase badge, current concept, time ago
- **Enhancement:** mini segmented progress bar under the card header — one segment per plan phase, filled proportionally to show plan depth at a glance
- **Empty state:** "No study plans yet. Start a conversation to create one."
- Clicking a card sets `selectedTopic` state, transitioning to the detail view

### Detail View (Expanded)

When a topic card is clicked, the grid is replaced by a detail view for that topic.

**Header:**
- Back button ("← All Study Plans") — clears `selectedTopic`, returns to grid
- Topic name (large heading)
- Phase badge
- Progress ring (reused from `StudyTopicCard`)
- "Continue" button linking to the topic's latest thread

**Plan Progress (main section):**
- Reuses the pattern from `TopicProgress` / `PlanView`
- Phases shown as collapsible groups
- Each phase has concept rows: check icon (completed), circle (pending), highlight (current)
- Per-phase counts: `X/Y concepts`
- Data fetched via `getProgress(threadId)` (existing endpoint)

**Mastery & Tests (placeholder):**
- Section titled "Tests"
- Muted placeholder message: "Mastery tests coming soon. You'll be able to track Feynman test scores for each concept here."
- Styled as a subtle bordered box — clearly a future slot

**Thread Tree:**
- Section titled "Conversations"
- Thread hierarchy using `react-arborist` (same pattern as sidebar `ThreadTree`)
- Data fetched via `fetchThreadTrees()` filtered to this topic's root thread
- Clicking a thread navigates to `/threads/{id}`

## Component Structure

```
StudyPlansPage (client)
├── SearchInput (controlled, filters topics by name)
├── TopicGrid (shown when selectedTopic is null)
│   └── StudyTopicCard (existing, enhanced with mini progress bar)
└── TopicDetail (shown when selectedTopic is set)
    ├── DetailHeader (topic name, phase badge, progress ring, continue button)
    ├── PlanProgress (phases + concepts via getProgress)
    ├── MasteryPlaceholder (static placeholder box)
    └── TopicThreadTree (react-arborist tree for this topic's root)
```

## State Management

- `selectedTopic: StudyTopic | null` — drives grid ↔ detail toggle
- `query: string` — search input, filters topics client-side by name match

## Data Fetching

| View | Hook / Function | Endpoint |
|------|----------------|----------|
| Grid | `useStudyTopics()` | `GET /api/threads/study-topics` |
| Detail — plan | `useQuery(['progress', threadId], () => getProgress(threadId))` | `GET /api/threads/{id}/progress` |
| Detail — threads | `useThreadTree()` | `GET /api/threads/tree` |

No new API endpoints required. All data is served by existing backend routes.

## File Organization

New files in `client/app/study-plans/`:
- `page.tsx` — rewritten as client component with search + grid/detail toggle
- `topic-detail.tsx` — detail view component (header, plan, mastery, threads)

Reuses existing:
- `StudyTopicCard` from `client/components/study-topic-card.tsx` (enhanced with mini progress bar)
- `ThreadTree` pattern from `client/components/thread-tree.tsx`
- `useStudyTopics` from `client/hooks/use-study-topics.ts`
- `useThreadTree` from `client/hooks/use-thread-tree.ts`

## Out of Scope

- Mastery scoring / Feynman test wiring (placeholder only)
- Animations for grid-to-detail transition (can be added later)
- Drag-and-drop reordering of topics
- Topic deletion from this page
