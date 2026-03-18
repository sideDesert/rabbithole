"use client";

import type { PracticeQuestion, QuestionFeedback } from "@/lib/api";
import { CircleCheck, CircleX } from "lucide-react";

interface TestQuestionProps {
  index: number;
  question: PracticeQuestion;
  answer: string;
  onChange: (answer: string) => void;
  disabled?: boolean;
  feedback?: QuestionFeedback;
}

function QuestionHeader({
  index,
  type,
  feedback,
}: {
  index: number;
  type: string;
  feedback?: QuestionFeedback;
}) {
  const typeLabel: Record<string, string> = {
    mcq_single: "Multiple Choice",
    mcq_multi: "Multiple Select",
    freeform: "Free Response",
    cloze: "Fill in the Blank",
    teach_back: "Teach It Back",
    scenario: "Scenario",
  };

  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm font-medium text-muted-foreground">
        Q{index + 1}
      </span>
      <span className="text-xs px-2 py-0.5 rounded-md border-2 border-border bg-muted text-muted-foreground">
        {typeLabel[type] || type}
      </span>
      {feedback && (
        <span className="ml-auto flex items-center gap-1 text-sm">
          {feedback.correct ? (
            <CircleCheck className="h-4 w-4 text-green-500" />
          ) : (
            <CircleX className="h-4 w-4 text-red-500" />
          )}
          <span className="text-muted-foreground">
            {Math.round(feedback.score * 100)}%
          </span>
        </span>
      )}
    </div>
  );
}

function FeedbackBlock({ feedback }: { feedback: QuestionFeedback }) {
  return (
    <div
      className={`mt-3 rounded-md border-2 px-4 py-3 text-sm ${
        feedback.correct
          ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
          : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"
      }`}
    >
      {feedback.feedback}
    </div>
  );
}

function McqSingle({
  question,
  answer,
  onChange,
  disabled,
}: Omit<TestQuestionProps, "index" | "feedback">) {
  const options = question.options || [];
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const value = opt.charAt(0); // "A", "B", etc.
        return (
          <label
            key={opt}
            className={`flex items-center gap-3 rounded-md border-2 px-4 py-3 cursor-pointer transition-colors ${
              answer === value
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted"
            } ${disabled ? "cursor-default opacity-70" : ""}`}
          >
            <input
              type="radio"
              name={question.id}
              value={value}
              checked={answer === value}
              onChange={() => onChange(value)}
              disabled={disabled}
              className="accent-primary"
            />
            <span className="text-sm">{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

function McqMulti({
  question,
  answer,
  onChange,
  disabled,
}: Omit<TestQuestionProps, "index" | "feedback">) {
  const options = question.options || [];
  const selected = answer ? answer.split(",") : [];

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(next.sort().join(","));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-1">
        Select all that apply
      </p>
      {options.map((opt) => {
        const value = opt.charAt(0);
        return (
          <label
            key={opt}
            className={`flex items-center gap-3 rounded-md border-2 px-4 py-3 cursor-pointer transition-colors ${
              selected.includes(value)
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted"
            } ${disabled ? "cursor-default opacity-70" : ""}`}
          >
            <input
              type="checkbox"
              value={value}
              checked={selected.includes(value)}
              onChange={() => toggle(value)}
              disabled={disabled}
              className="accent-primary"
            />
            <span className="text-sm">{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

function Freeform({
  question,
  answer,
  onChange,
  disabled,
}: Omit<TestQuestionProps, "index" | "feedback">) {
  return (
    <div>
      {question.explanation_hint && (
        <p className="text-xs text-muted-foreground mb-2 italic">
          {question.explanation_hint}
        </p>
      )}
      <textarea
        value={answer}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Type your answer..."
        rows={4}
        className="w-full rounded-md border-2 border-border bg-background px-4 py-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70"
      />
    </div>
  );
}

function Cloze({
  question,
  answer,
  onChange,
  disabled,
}: Omit<TestQuestionProps, "index" | "feedback">) {
  // Split question text on _____ to create inline input
  const parts = question.question.split("_____");

  if (parts.length < 2) {
    // Fallback to freeform if no blank found
    return (
      <Freeform
        question={question}
        answer={answer}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="text-sm leading-relaxed">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <input
              type="text"
              value={answer}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder="..."
              className="inline-block w-40 border-b-2 border-primary bg-transparent px-1 py-0.5 text-center text-sm focus:outline-none focus:border-primary disabled:opacity-70"
            />
          )}
        </span>
      ))}
    </div>
  );
}

export function TestQuestion({
  index,
  question,
  answer,
  onChange,
  disabled,
  feedback,
}: TestQuestionProps) {
  // For cloze type, question text is embedded in the component itself
  const showQuestionText = question.type !== "cloze";

  return (
    <div className="rounded-lg border-2 border-border shadow-md bg-card p-5 space-y-3">
      <QuestionHeader index={index} type={question.type} feedback={feedback} />

      {showQuestionText && (
        <p className="text-sm font-medium leading-relaxed">
          {question.question}
        </p>
      )}

      {question.type === "mcq_single" && (
        <McqSingle
          question={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {question.type === "mcq_multi" && (
        <McqMulti
          question={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {question.type === "cloze" && (
        <Cloze
          question={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {(question.type === "freeform" ||
        question.type === "teach_back" ||
        question.type === "scenario") && (
        <Freeform
          question={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      )}

      {feedback && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
