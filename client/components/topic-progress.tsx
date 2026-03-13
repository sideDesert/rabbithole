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
          const isCurrent = currentConcept && concept.name === currentConcept;
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
        <span className="text-sm font-medium truncate  max-w-40">
          {data.topic}
        </span>
        <ProgressRing progress={data.overall_progress} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-popover border border-border rounded-xl shadow-lg p-3 z-30 animate-in fade-in slide-in-from-top-1 duration-150 max-h-80 overflow-y-auto">
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
