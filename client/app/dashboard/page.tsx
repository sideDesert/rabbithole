"use client";

import { useState } from "react";
import Link from "next/link";
import { useStudyTopics } from "@/hooks/use-study-topics";
import { useQuery } from "@tanstack/react-query";
import { getPendingTests, type PendingTest } from "@/lib/api";
import { StudyTopicCard } from "@/components/study-topic-card";
import { Input } from "@/components/ui/input";
import { ThemeIcon } from "@/components/theme-icon";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { Skeleton } from "@/components/ui/skeleton";

function Heading({ children }: { children?: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-foreground">{children}</h2>;
}

const TIER_VARIANTS: Record<
  string,
  "destructive" | "secondary" | "default" | "outline"
> = {
  weak: "destructive",
  medium: "secondary",
  strong: "default",
  mastered: "outline",
};

function TestCard({ test }: { test: PendingTest }) {
  return (
    <Link
      href={`/practice/test?concept=${encodeURIComponent(test.concept_name)}&topic=${encodeURIComponent(test.topic_slug)}`}
      className="block h-full"
    >
      <Card
        size="sm"
        className="card-hover transition-shadow cursor-pointer h-full flex flex-col"
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
            Start Test <ThemeIcon name="chevronRight" className="ml-1 size-4" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}

function TestsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["practice-pending"],
    queryFn: getPendingTests,
    refetchInterval: 5 * 60_000,
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
          <Link href="/practice" className="underline">
            Test yourself
          </Link>
        </p>
      )}
      {!isLoading && tests.length > 0 && (
        <div className="mt-4">
          <Carousel opts={{ align: "start" }}>
            <CarouselContent className="-ml-4 p-2">
              {tests.slice(0, 5).map((test) => (
                <CarouselItem key={test.id} className="pl-4 basis-1/2">
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

function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col rounded-lg border-2 border-border overflow-hidden"
        >
          <Skeleton className="h-28 rounded-none" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <div className="p-4 pt-0 flex justify-between">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </>
  );
}

function NewTopicCard() {
  return (
    <Link href="/feynman" className="block h-full">
      <div className="flex flex-col items-center justify-center h-full min-h-[280px] rounded-lg border-2 border-dashed border-border hover:border-foreground transition-colors cursor-pointer">
        <div className="flex items-center justify-center size-12 rounded-full border-2 border-dashed border-border mb-3">
          <ThemeIcon name="circlePlus" className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          Start a new topic
        </p>
      </div>
    </Link>
  );
}

function ThreadsSection() {
  const { topics: allTopics, isLoading } = useStudyTopics();
  const [search, setSearch] = useState("");
  const [groupByTopic, setGroupByTopic] = useState(false);

  const query = search.toLowerCase().trim();
  const filtered = query
    ? allTopics.filter(
        (t) =>
          t.topic.toLowerCase().includes(query) ||
          (t.current_concept?.toLowerCase().includes(query) ?? false) ||
          t.latest_thread.title.toLowerCase().includes(query),
      )
    : allTopics;

  return (
    <div>
      <Heading>Threads</Heading>

      {!isLoading && (
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-sm">
            <ThemeIcon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search topics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button
            variant={groupByTopic ? "secondary" : "outline"}
            size="sm"
            onClick={() => setGroupByTopic((g) => !g)}
          >
            Group by topic
          </Button>
        </div>
      )}

      {!isLoading && filtered.length === 0 && query && (
        <p className="text-muted-foreground text-sm mt-4">
          No threads match your search.
        </p>
      )}

      {(isLoading || (!groupByTopic && (filtered.length > 0 || !query))) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isLoading && <SkeletonCards />}
          {!isLoading && !query && <NewTopicCard />}
          {!isLoading &&
            filtered.map((topic) => (
              <StudyTopicCard key={topic.latest_thread.id} topic={topic} />
            ))}
        </div>
      )}

      {!isLoading && filtered.length > 0 && groupByTopic && (
        <div className="mt-4 space-y-6">
          {!query && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NewTopicCard />
            </div>
          )}
          {Object.entries(
            filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
              (acc[t.topic] ??= []).push(t);
              return acc;
            }, {}),
          ).map(([topicName, items]) => (
            <div key={topicName}>
              <h3 className="text-lg font-medium text-foreground mb-3">
                {topicName}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {items.map((topic) => (
                  <StudyTopicCard key={topic.latest_thread.id} topic={topic} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const { topics, isLoading: topicsLoading } = useStudyTopics(5);

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-6 space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview</p>
      </div>
      <div className="w-full space-y-8">
        <TestsSection />
        <div>
          <Heading>Continue Learning</Heading>
          {topicsLoading && (
            <p className="text-muted-foreground text-sm mt-4">Loading…</p>
          )}
          {!topicsLoading && topics.length === 0 && (
            <p className="text-muted-foreground text-sm mt-4">
              No study topics yet.{" "}
              <Link href="/feynman" className="underline">
                Start learning
              </Link>
            </p>
          )}
          {!topicsLoading && topics.length > 0 && (
            <div className="mt-4">
              <Carousel opts={{ align: "start" }}>
                <CarouselContent className="-ml-4 p-2">
                  {topics.map((topic, i) => (
                    <CarouselItem
                      key={`${topic.root_thread_id}-${topic.latest_thread.id}`}
                      className="pl-4 basis-1/2"
                    >
                      <StudyTopicCard topic={topic} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </div>
          )}
        </div>
        <div>
          <Heading>Suggestions</Heading>
        </div>
        <ThreadsSection />
      </div>
    </div>
  );
}
