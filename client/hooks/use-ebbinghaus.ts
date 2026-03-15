"use client";

import { useState, useEffect, useCallback } from "react";
import {
  generateTest,
  submitTest,
  type GenerateTestResponse,
  type TestSubmitResponse,
} from "@/lib/api";

type Phase = "loading" | "answering" | "submitting" | "results" | "error";

export function useEbbinghaus(conceptName: string, topicSlug: string) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [test, setTest] = useState<GenerateTestResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<TestSubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate test on mount
  useEffect(() => {
    if (!conceptName || !topicSlug) return;

    let cancelled = false;

    async function generate() {
      setPhase("loading");
      setError(null);
      try {
        const resp = await generateTest(conceptName, topicSlug);
        if (cancelled) return;

        if (resp.error) {
          setError(resp.message || resp.error);
          setPhase("error");
          return;
        }

        setTest(resp);
        setPhase("answering");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to generate test");
        setPhase("error");
      }
    }

    generate();
    return () => {
      cancelled = true;
    };
  }, [conceptName, topicSlug]);

  const updateAnswer = useCallback((questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  const submit = useCallback(async () => {
    if (!test) return;

    setPhase("submitting");
    try {
      const answerList = Object.entries(answers).map(([qid, answer]) => ({
        question_id: qid,
        answer,
      }));
      const resp = await submitTest(test.test_id, answerList);
      setResults(resp);
      setPhase("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit test");
      setPhase("error");
    }
  }, [test, answers]);

  const allAnswered =
    test?.questions.every((q) => {
      const a = answers[q.id];
      return a !== undefined && a.trim() !== "";
    }) ?? false;

  return {
    phase,
    test,
    answers,
    results,
    error,
    allAnswered,
    updateAnswer,
    submit,
  };
}
