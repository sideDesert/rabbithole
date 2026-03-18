"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getPendingTests, getTestableTopics } from "@/lib/api";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Clock, TestTube } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TIER_COLORS: Record<string, string> = {
  weak: "destructive",
  medium: "secondary",
  strong: "default",
  mastered: "outline",
};

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <Badge
      variant={
        (TIER_COLORS[tier] as
          | "destructive"
          | "secondary"
          | "default"
          | "outline") || "secondary"
      }
    >
      {tier}
    </Badge>
  );
}

export default function PracticePage() {
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["practice-pending"],
    queryFn: getPendingTests,
    refetchInterval: 60_000,
  });

  const { data: topicsData, isLoading: topicsLoading } = useQuery({
    queryKey: ["practice-topics"],
    queryFn: getTestableTopics,
    staleTime: 60_000,
  });

  const pending = pendingData?.tests ?? [];
  const topics = topicsData?.topics ?? [];

  return (
    <div className="w-full max-w-3xl mx-auto px-6 py-8 space-y-10">
      <div>
        <h1 className="text-3xl font-semibold">Practice</h1>
        <p className="text-muted-foreground mt-1">
          Spaced repetition review tests
        </p>
      </div>

      {/* Pending Tests */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Scheduled Reviews
        </h2>

        {pendingLoading && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}

        {!pendingLoading && pending.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-lg p-6">
            <p className="text-sm text-muted-foreground">
              No tests scheduled. Pick a topic below to test yourself.
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {pending.map((test) => (
              <Card key={test.id} size="sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {test.concept_name}
                    </CardTitle>
                    <TierBadge tier={test.mastery_tier} />
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <p className="text-xs text-muted-foreground">
                    Mastery: {Math.round(test.mastery_score * 100)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due: {new Date(test.scheduled_for).toLocaleDateString()}
                  </p>
                </CardContent>
                <CardFooter>
                  <Link
                    href={`/practice/test?concept=${encodeURIComponent(test.concept_name)}&topic=${encodeURIComponent(test.topic_slug)}`}
                  >
                    <Button size="sm">Start Test</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Test Yourself */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Test Yourself
        </h2>

        {topicsLoading && (
          <p className="text-sm text-muted-foreground">Loading topics...</p>
        )}

        {!topicsLoading && topics.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-lg p-6">
            <p className="text-sm text-muted-foreground">
              No completed concepts yet. Learn something with Mr. Feynman first!
            </p>
          </div>
        )}

        {topics.map((topic) => (
          <TopicGroup key={topic.topic_slug} topic={topic} />
        ))}
      </section>
    </div>
  );
}

function TopicGroup({
  topic,
}: {
  topic: {
    topic_slug: string;
    topic_name: string;
    concepts: {
      name: string;
      mastery_score: number | null;
      mastery_tier: string | null;
    }[];
  };
}) {
  const [open, setOpen] = useState(true);
  const router = useRouter();

  return (
    <div className="rounded-lg border-2 bg-card border-border shadow-md overflow-hidden">
      <Button
        variant={"ghost"}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium">{topic.topic_name}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {topic.concepts.length} concept
          {topic.concepts.length !== 1 ? "s" : ""}
        </span>
      </Button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {topic.concepts.map((concept) => (
            <Button
              onClick={() => {
                router.push(
                  `/ebbinghaus/test?concept=${encodeURIComponent(concept.name)}&topic=${encodeURIComponent(topic.topic_slug)}`,
                );
              }}
              variant={"ghost"}
              key={concept.name}
              className="flex w-full rounded-none justify-between items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors"
            >
              <div>
                <span className="text-sm flex-1">{concept.name}</span>
              </div>
              <div className="flex gap-2 items-center">
                {concept.mastery_score != null && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(concept.mastery_score * 100)}%
                  </span>
                )}
                <TierBadge tier={concept.mastery_tier} />
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
