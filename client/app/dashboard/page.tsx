"use client";

import Link from "next/link";
import { useThreads } from "@/hooks/use-threads";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getProgress, getPendingTests, type Thread, type PendingTest } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import { ChevronRightIcon } from "lucide-react";

function Heading({ children }: { children?: React.ReactNode }) {
  return (
    <h2 className="text-2xl font-medium text-dark-1 dark:text-light-1">
      {children}
    </h2>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

function phaseLabel(phase: string) {
  if (phase === "interview") return "Interview";
  if (phase === "planning") return "Planning";
  if (phase === "teaching") return "Learning";
  return phase;
}

function ThreadCard({
  thread,
  progress,
}: {
  thread: Thread;
  progress?: number;
}) {
  const description =
    thread.summary || thread.branch_text || thread.current_concept;

  return (
    <Link href={`/threads/${thread.id}`} className="block h-full">
      <Card
        size="sm"
        className="hover:ring-foreground/20 transition-shadow cursor-pointer h-full flex flex-col"
      >
        <CardHeader>
          <CardTitle className="line-clamp-2 text-base">
            {thread.title || thread.topic_slug}
          </CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary">{phaseLabel(thread.phase)}</Badge>
            <Badge variant="outline">
              {new Date(thread.updated_at).toLocaleDateString()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-2">
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {description}
            </p>
          )}
          {thread.parent_summary && (
            <p className="text-xs text-muted-foreground/70 line-clamp-2 italic">
              {thread.parent_summary}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-2">
          {progress != null && (
            <div className="w-full flex items-center gap-2">
              <ProgressBar value={progress} />
              <span className="text-xs text-muted-foreground shrink-0">
                {Math.round(progress * 100)}%
              </span>
            </div>
          )}
          <Button variant="ghost" size="sm" className="ml-auto">
            Continue <ChevronRightIcon className="ml-1 size-4" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}

const TIER_VARIANTS: Record<string, "destructive" | "secondary" | "default" | "outline"> = {
  weak: "destructive",
  medium: "secondary",
  strong: "default",
  mastered: "outline",
};

function TestCard({ test }: { test: PendingTest }) {
  return (
    <Link
      href={`/ebbinghaus/test?concept=${encodeURIComponent(test.concept_name)}&topic=${encodeURIComponent(test.topic_slug)}`}
      className="block h-full"
    >
      <Card
        size="sm"
        className="hover:ring-foreground/20 transition-shadow cursor-pointer h-full flex flex-col"
      >
        <CardHeader>
          <CardTitle className="line-clamp-2 text-base">
            {test.concept_name}
          </CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant={TIER_VARIANTS[test.mastery_tier] || "secondary"}>
              {test.mastery_tier}
            </Badge>
            <Badge variant="outline">
              {Math.round(test.mastery_score * 100)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          <p className="text-xs text-muted-foreground">
            Due: {new Date(test.scheduled_for).toLocaleDateString()}
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="ghost" size="sm" className="ml-auto">
            Start Test <ChevronRightIcon className="ml-1 size-4" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}

function TestsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["ebbinghaus-pending"],
    queryFn: getPendingTests,
    refetchInterval: 60_000,
  });

  const tests = data?.tests ?? [];

  return (
    <div>
      <Heading>Tests</Heading>
      {isLoading && (
        <p className="text-muted-foreground text-sm mt-4">Loading...</p>
      )}
      {!isLoading && tests.length === 0 && (
        <p className="text-muted-foreground text-sm mt-4">
          No upcoming tests.{" "}
          <Link href="/ebbinghaus" className="underline">
            Test yourself
          </Link>
        </p>
      )}
      {!isLoading && tests.length > 0 && (
        <div className="mt-4 px-14">
          <Carousel opts={{ align: "start" }}>
            <CarouselContent className="-ml-4 p-2">
              {tests.slice(0, 5).map((test) => (
                <CarouselItem
                  key={test.id}
                  className="pl-4 basis-1/2 sm:basis-1/3 lg:basis-1/4"
                >
                  <TestCard test={test} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const { threads, isLoading } = useThreads();

  const sorted = (threads?.threads ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

  const progressQueries = useQueries({
    queries: sorted.map((t) => ({
      queryKey: ["progress", t.id],
      queryFn: () => getProgress(t.id),
      enabled: t.phase === "teaching",
      staleTime: 60_000,
    })),
  });

  const progressMap = new Map<string, number>();
  sorted.forEach((t, i) => {
    const data = progressQueries[i]?.data;
    if (data?.overall_progress != null) {
      progressMap.set(t.id, data.overall_progress);
    }
  });

  return (
    <div className="w-full px-6 pb-6">
      <div className="w-full space-y-8">
        <div>
          <Heading>Continue</Heading>
          {isLoading && (
            <p className="text-muted-foreground text-sm mt-4">Loading…</p>
          )}
          {!isLoading && sorted.length === 0 && (
            <p className="text-muted-foreground text-sm mt-4">
              No threads yet.
            </p>
          )}
          {!isLoading && sorted.length > 0 && (
            <div className="mt-4 px-14">
              <Carousel opts={{ align: "start" }}>
                <CarouselContent className="-ml-4 p-2">
                  {sorted.slice(0, 5).map((thread) => (
                    <CarouselItem
                      key={thread.id}
                      className="pl-4 basis-1/2 sm:basis-1/3 lg:basis-1/4"
                    >
                      <ThreadCard
                        thread={thread}
                        progress={progressMap.get(thread.id)}
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </div>
          )}
        </div>
        <TestsSection />
        <div>
          <Heading>Suggestions</Heading>
        </div>
        <div>
          <Heading>Threads</Heading>
        </div>
      </div>
    </div>
  );
}
