"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { useStudyTopics } from "@/hooks/use-study-topics";
import { type StudyTopic } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StudyPlanCard } from "./study-plan-card";
import { TopicDetail } from "./topic-detail";

export default function StudyPlansPage() {
  const { topics, isLoading } = useStudyTopics();
  const [selectedTopic, setSelectedTopic] = useState<StudyTopic | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return topics;
    const q = query.toLowerCase();
    return topics.filter((t) => t.topic.toLowerCase().includes(q));
  }, [topics, query]);

  if (selectedTopic) {
    return (
      <div className="px-6 py-6 max-w-3xl mx-auto">
        <TopicDetail topic={selectedTopic} onBack={() => setSelectedTopic(null)} />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Study Plans</h1>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search topics..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-28 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty states */}
      {!isLoading && topics.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No study plans yet. Start a conversation to create one.
        </p>
      )}

      {!isLoading && topics.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No topics match your search.
        </p>
      )}

      {/* Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((topic) => (
            <StudyPlanCard
              key={topic.root_thread_id}
              topic={topic}
              onClick={() => setSelectedTopic(topic)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
