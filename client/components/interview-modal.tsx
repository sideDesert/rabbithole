"use client";

import { useCallback, useEffect, useState } from "react";
import { AltArrowLeftBoldDuotone, AltArrowRightBoldDuotone, Pen2BoldDuotone } from "solar-icon-set";
import { Button } from "./ui/button";
import type { InterviewQuestion } from "@/lib/api";
import { cn } from "@/lib/utils";

interface InterviewWidgetProps {
  questions: InterviewQuestion[];
  onSubmit: (answers: Record<number, string>) => void;
  onDismiss?: () => void;
  className?: string;
}

export function InterviewWidget({
  questions,
  onSubmit,
  onDismiss,
  className,
}: InterviewWidgetProps) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [otherText, setOtherText] = useState<Record<number, string>>({});

  const q = questions[current];
  const selected = answers[current];
  const allAnswered = questions.every((_, i) => answers[i] !== undefined);
  const isLast = current === questions.length - 1;

  function isOtherOption(option: string) {
    const lower = option.toLowerCase();
    return lower.includes("other") || lower.includes("tell me");
  }

  function selectOption(option: string) {
    setAnswers((prev) => ({ ...prev, [current]: option }));
    if (!isLast && !isOtherOption(option)) {
      setTimeout(
        () => setCurrent((c) => Math.min(c + 1, questions.length - 1)),
        200,
      );
    }
  }

  function handleOtherChange(text: string) {
    setOtherText((prev) => ({ ...prev, [current]: text }));
    if (text.trim()) {
      setAnswers((prev) => ({ ...prev, [current]: `Other: ${text}` }));
    }
  }

  function handleSubmit() {
    if (!allAnswered) return;
    onSubmit(answers);
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "ArrowLeft" && current > 0) {
        setCurrent((c) => c - 1);
      } else if (e.key === "ArrowRight" && current < questions.length - 1) {
        setCurrent((c) => c + 1);
      } else if (e.key === "Escape") {
        if (allAnswered) handleSubmit();
        else setCurrent((c) => Math.min(c + 1, questions.length - 1));
      } else if (e.key === "Enter" && allAnswered) {
        handleSubmit();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, questions.length, allAnswered],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const selectedIsOther =
    selected !== undefined && selected.startsWith("Other: ");
  const otherActive = selectedIsOther || selected === q.options.find((o) => isOtherOption(o));

  const regularOptions = q.options.filter((o) => !isOtherOption(o));
  const otherOption = q.options.find((o) => isOtherOption(o));
  const answeredCount = questions.filter((_, i) => answers[i] !== undefined).length;
  const progress = (answeredCount / questions.length) * 100;

  return (
    <div className={cn("w-full", className)}>
      <div className="bg-background pb-6">
        <div className="rounded-xl ring-1 ring-border shadow-sm overflow-hidden">
          {/* Progress bar */}
          <div className="h-0.5 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Question + nav */}
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2.5">
            <p className="text-sm font-medium text-foreground leading-snug">
              {q.question}
            </p>
            <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground pt-0.5">
              <button
                onClick={() => setCurrent((c) => c - 1)}
                disabled={current === 0}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <AltArrowLeftBoldDuotone className="size-3.5" />
              </button>
              <span className="tabular-nums">
                {current + 1} of {questions.length}
              </span>
              <button
                onClick={() => setCurrent((c) => c + 1)}
                disabled={isLast}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <AltArrowRightBoldDuotone className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="px-3 pb-3 space-y-1">
            {regularOptions.map((option, optIdx) => {
              const isSelected = selected === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectOption(option)}
                  className={cn(
                    "w-full flex items-center gap-3 text-left text-sm px-2.5 py-2.5 rounded-lg transition-all duration-150",
                    isSelected
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-muted/60 text-foreground/70",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 size-5.5 flex items-center justify-center rounded-md text-xs font-medium transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {optIdx + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    {option.replace(/^[A-E]\)\s*/, "")}
                  </span>
                </button>
              );
            })}

            {/* "Other" — rendered as a div with a nested clickable area + input */}
            {otherOption && (
              <div
                className={cn(
                  "flex items-center gap-3 text-sm px-2.5 py-2.5 rounded-lg transition-all duration-150",
                  otherActive
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted/60 text-muted-foreground cursor-pointer",
                )}
                onClick={() => {
                  if (!otherActive) {
                    const text = otherText[current] || "";
                    selectOption(
                      text.trim() ? `Other: ${text}` : otherOption,
                    );
                  }
                }}
              >
                <span className="shrink-0 size-5.5 flex items-center justify-center rounded-md">
                  <Pen2BoldDuotone className="size-3" />
                </span>
                {otherActive ? (
                  <input
                    autoFocus
                    value={otherText[current] || ""}
                    onChange={(e) => handleOtherChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && otherText[current]?.trim()) {
                        if (!isLast)
                          setCurrent((c) =>
                            Math.min(c + 1, questions.length - 1),
                          );
                        else if (allAnswered) handleSubmit();
                      }
                    }}
                    placeholder="Tell me more..."
                    className="flex-1 min-w-0 h-6 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
                  />
                ) : (
                  <span className="text-muted-foreground/50">
                    Something else
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/50">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground/40">
              <span className="flex items-center gap-1">
                <kbd className="inline-flex items-center justify-center size-4 rounded border border-border/50 text-[9px]">←</kbd>
                <kbd className="inline-flex items-center justify-center size-4 rounded border border-border/50 text-[9px]">→</kbd>
                <span className="ml-0.5">navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex items-center justify-center h-4 px-1 rounded border border-border/50 text-[9px]">Enter</kbd>
                <span className="ml-0.5">submit</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex items-center justify-center h-4 px-1 rounded border border-border/50 text-[9px]">Esc</kbd>
                <span className="ml-0.5">skip</span>
              </span>
            </div>
            {allAnswered && isLast ? (
              <Button
                onClick={handleSubmit}
                size="sm"
                className="cursor-pointer h-7 text-xs"
              >
                Submit
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrent((c) => Math.min(c + 1, questions.length - 1))
                }
                disabled={isLast && !allAnswered}
                className="cursor-pointer h-7 text-xs"
              >
                Skip
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
