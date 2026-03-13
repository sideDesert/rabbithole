# Topic Progress Widget Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact topic name + circular progress ring widget to the top bar, with a hover/click dropdown showing phase and concept completion status.

**Architecture:** Single new component `TopicProgress` reads `threadId` from `usePlan()` context, fetches progress via TanStack Query (shared cache with `PlanView`), and renders a CSS conic-gradient ring + topic label with a custom popover dropdown. Slotted into the existing `TopBar` left section.

**Tech Stack:** React, TanStack Query, Tailwind CSS, existing `getProgress` API

**Spec:** `docs/superpowers/specs/2026-03-13-topic-progress-widget-design.md`

---

## Chunk 1: TopicProgress Component + TopBar Integration

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `client/components/topic-progress.tsx` | Create | The widget: progress ring, topic label, dropdown with phase/concept list |
| `client/components/top-bar.tsx` | Modify | Import and render `TopicProgress` in the left section |

---

### Task 1: Create the `TopicProgress` component

**Files:**
- Create: `client/components/topic-progress.tsx`

- [ ] **Step 1: Create the component file with the circular progress ring and topic label**

The component fetches progress data and renders a button with topic name + CSS ring. Returns `null` when no data.

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { getProgress, type PlanPhase } from "@/lib/api";
import { usePlan } from "./plan-context";
import { useRef, useState, useCallback, useEffect } from "react";
import { Check, Circle } from "lucide-react";

function ProgressRing({
  progress,
  size = 20,
  strokeWidth = 3,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const innerSize = size - strokeWidth;
  const deg = Math.round(progress * 360);

  return (
    <div
      className="rounded-full shrink-0 transition-all duration-500"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--primary) ${deg}deg, var(--muted) ${deg}deg)`,
        mask: `radial-gradient(farthest-side, transparent calc(50% - ${strokeWidth}px), #000 calc(50% - ${strokeWidth - 1}px), #000 50%, transparent 51%)`,
        WebkitMask: `radial-gradient(farthest-side, transparent calc(50% - ${strokeWidth}px), #000 calc(50% - ${strokeWidth - 1}px), #000 50%, transparent 51%)`,
      }}
    />
  );
}

function PhaseGroup({
  phase,
  currentConcept,
}: {
  phase: PlanPhase;
  currentConcept: string | null;
}) {
  const completed = phase.concepts.filter((c) => c.completed).length;

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-foreground">
          {phase.title}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {completed}/{phase.concepts.length}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {phase.concepts.map((concept) => {
          const isCurrent =
            currentConcept && concept.name === currentConcept;
          return (
            <div
              key={concept.name}
              className={`flex items-center gap-2 py-0.5 px-1 rounded text-xs ${
                isCurrent
                  ? "bg-primary/10 text-foreground"
                  : concept.completed
                    ? "text-muted-foreground"
                    : "text-foreground"
              }`}
            >
              {concept.completed ? (
                <Check className="size-3 shrink-0 text-primary" />
              ) : (
                <Circle
                  className={`size-3 shrink-0 ${isCurrent ? "text-primary" : "text-muted-foreground/50"}`}
                />
              )}
              <span className={concept.completed ? "line-through" : ""}>
                {concept.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TopicProgress() {
  const { threadId } = usePlan();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["progress", threadId],
    queryFn: () => getProgress(threadId!),
    enabled: !!threadId,
  });

  const isOpen = isHovered || isPinned;

  const handleMouseEnter = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    enterTimer.current = setTimeout(() => setIsHovered(true), 150);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    leaveTimer.current = setTimeout(() => setIsHovered(false), 300);
  }, []);

  const handleClick = useCallback(() => {
    setIsPinned((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsPinned(false);
        setIsHovered(false);
      }
    },
    [isOpen],
  );

  // Close on outside click when pinned
  useEffect(() => {
    if (!isPinned) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsPinned(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isPinned]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (enterTimer.current) clearTimeout(enterTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  if (!data?.phases?.length) return null;

  const totalConcepts = data.phases.reduce(
    (sum, p) => sum + p.concepts.length,
    0,
  );
  const completedConcepts = data.phases.reduce(
    (sum, p) => sum + p.concepts.filter((c) => c.completed).length,
    0,
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="text-sm font-medium truncate max-w-[160px]">
          {data.topic}
        </span>
        <ProgressRing progress={data.overall_progress} />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-2 w-72 bg-popover border border-border rounded-xl shadow-lg p-3 z-30 animate-in fade-in slide-in-from-top-1 duration-150 max-h-80 overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">
              Progress
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {completedConcepts}/{totalConcepts} concepts
            </span>
          </div>
          <div className="divide-y divide-border">
            {data.phases.map((phase) => (
              <PhaseGroup
                key={phase.order}
                phase={phase}
                currentConcept={data.current_concept}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build 2>&1 | head -30`

Expected: No TypeScript errors related to `topic-progress.tsx`. Build may fail for other reasons but the new file should compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add client/components/topic-progress.tsx
git commit -m "feat: add TopicProgress component with progress ring and dropdown"
```

---

### Task 2: Integrate into TopBar

**Files:**
- Modify: `client/components/top-bar.tsx:1-74`

- [ ] **Step 1: Add `TopicProgress` to the top bar's left section**

In `client/components/top-bar.tsx`, add the import at the top:

```tsx
import { TopicProgress } from "@/components/topic-progress";
```

Then in the JSX, add `<TopicProgress />` after the existing title/back button section, inside the left flex container (the `div` with `className="flex items-center gap-2"`). Place it after the inner `div` that holds the back button and title:

```tsx
<div className="flex items-center gap-2">
  <SidebarTrigger />
  <div className="flex flex-row items-center gap-4">
    {config?.back && (
      <Button variant="outline">
        <ChevronLeft /> Back to Root
      </Button>
    )}
    {config?.title && <h2 className="font-medium">{config.title}</h2>}
  </div>
  <TopicProgress />
</div>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm build 2>&1 | head -30`

Expected: Build succeeds.

- [ ] **Step 3: Manual visual check**

Run: `cd /Users/siddarth/dev/hackathon/evermemos/learn-os/client && pnpm dev`

Open a thread that has a learning plan. Verify:
1. Topic name + progress ring appear in the top bar
2. Hovering shows the dropdown with phases and concepts
3. Clicking pins the dropdown open
4. Clicking outside or pressing Escape closes it
5. Threads without a plan show no widget

- [ ] **Step 4: Commit**

```bash
git add client/components/top-bar.tsx
git commit -m "feat: integrate TopicProgress widget into top bar"
```

- [ ] **Step 5: Check for conic-gradient aliasing**

During the manual check, inspect the 20px ring closely. If the arc edge looks jagged or rough, replace the `ProgressRing` implementation with an SVG approach:

```tsx
function ProgressRing({
  progress,
  size = 20,
  strokeWidth = 3,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-500"
      />
    </svg>
  );
}
```

If replaced, commit:
```bash
git add client/components/topic-progress.tsx
git commit -m "fix: use SVG progress ring for cleaner rendering at small sizes"
```
