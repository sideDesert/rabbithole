"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePractice } from "@/hooks/use-practice";
import { TestQuestion } from "@/components/practice/test-question";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw } from "lucide-react";

function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted border border-border">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function TestPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        </div>
      }
    >
      <TestPageInner />
    </Suspense>
  );
}

function TestPageInner() {
  const params = useSearchParams();
  const conceptName = params.get("concept") || "";
  const topicSlug = params.get("topic") || "";

  const {
    phase,
    test,
    answers,
    results,
    error,
    allAnswered,
    updateAnswer,
    submit,
  } = usePractice(conceptName, topicSlug);

  if (!conceptName || !topicSlug) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-center">
        <p className="text-muted-foreground">
          Missing concept or topic. Go back and select a concept to test.
        </p>
        <Link href="/practice">
          <Button variant="ghost" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Practice
          </Button>
        </Link>
      </div>
    );
  }

  // Loading state
  if (phase === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">
          Generating your review test for <strong>{conceptName}</strong>...
        </p>
      </div>
    );
  }

  // Error state
  if (phase === "error") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-center space-y-4">
        <p className="text-red-500">{error}</p>
        <Link href="/practice">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Practice
          </Button>
        </Link>
      </div>
    );
  }

  // Results state
  if (phase === "results" && results) {
    const { scores, mastery_update } = results;
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <div>
          <Link href="/practice">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Results: {conceptName}</h1>
          <p className="text-5xl font-bold">
            {Math.round(results.overall_score * 100)}%
          </p>
        </div>

        {/* Score dimensions */}
        <div className="rounded-lg border-2 border-border shadow-md p-5 space-y-3">
          <h3 className="text-sm font-medium">Score Breakdown</h3>
          <ScoreBar label="Accuracy" value={scores.accuracy} />
          <ScoreBar label="Depth" value={scores.depth} />
          <ScoreBar label="Clarity" value={scores.clarity} />
          <ScoreBar label="Transferability" value={scores.transferability} />
        </div>

        {/* Mastery update */}
        <div className="rounded-lg border-2 border-border shadow-md p-5 space-y-2">
          <h3 className="text-sm font-medium">Mastery Update</h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {Math.round(mastery_update.previous_score * 100)}%
            </span>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="font-medium">
              {Math.round(mastery_update.new_score * 100)}%
            </span>
            <Badge variant="secondary">{mastery_update.tier}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Next review:{" "}
            {new Date(mastery_update.next_review).toLocaleDateString()}
          </p>
        </div>

        {/* Overall feedback */}
        {results.feedback && (
          <div className="rounded-lg border-2 border-border shadow-md p-5">
            <h3 className="text-sm font-medium mb-2">Feedback</h3>
            <p className="text-sm text-muted-foreground">{results.feedback}</p>
          </div>
        )}

        {/* Per-question results */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Question Details</h3>
          {test?.questions.map((q, i) => {
            const fb = results.per_question.find(
              (pq) => pq.question_id === q.id,
            );
            return (
              <TestQuestion
                key={q.id}
                index={i}
                question={q}
                answer={answers[q.id] || ""}
                onChange={() => {}}
                disabled
                feedback={fb}
              />
            );
          })}
        </div>

        <div className="text-center pb-8">
          <Link href="/practice">
            <Button>Back to Practice</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Answering / Submitting state
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/practice">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
        </div>
        <h1 className="text-lg font-semibold">{conceptName}</h1>
        <span className="text-sm text-muted-foreground">
          {test?.questions.length || 0} questions
        </span>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>
            {Object.keys(answers).filter((k) => answers[k]?.trim()).length} /{" "}
            {test?.questions.length || 0}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted border border-border">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${
                test?.questions.length
                  ? (Object.keys(answers).filter((k) => answers[k]?.trim())
                      .length /
                      test.questions.length) *
                    100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {test?.questions.map((q, i) => (
          <TestQuestion
            key={q.id}
            index={i}
            question={q}
            answer={answers[q.id] || ""}
            onChange={(val) => updateAnswer(q.id, val)}
            disabled={phase === "submitting"}
          />
        ))}
      </div>

      {/* Submit */}
      <div className="text-center pb-8">
        <Button
          onClick={submit}
          disabled={!allAnswered || phase === "submitting"}
          size="lg"
        >
          {phase === "submitting" ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Scoring...
            </>
          ) : (
            "Submit Test"
          )}
        </Button>
        {!allAnswered && (
          <p className="text-xs text-muted-foreground mt-2">
            Answer all questions to submit
          </p>
        )}
      </div>
    </div>
  );
}
