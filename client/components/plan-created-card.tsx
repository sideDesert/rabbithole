"use client";

import { ListTodo, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { usePlan } from "./plan-context";

interface PlanCreatedCardProps {
  topicSlug: string;
}

function formatTitle(slug: string) {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PlanCreatedCard({ topicSlug }: PlanCreatedCardProps) {
  const { setActiveTab } = usePlan();

  return (
    <div className="border border-border rounded-xl p-4 bg-card max-w-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ListTodo className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Learning plan created</p>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {formatTitle(topicSlug)}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full cursor-pointer"
        onClick={() => setActiveTab("plan-mode")}
      >
        View Plan <ArrowRight className="size-3.5 ml-1" />
      </Button>
    </div>
  );
}
