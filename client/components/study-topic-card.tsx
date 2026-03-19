"use client";

import Link from "next/link";
import { type StudyTopic } from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardFooter,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { topicGradient, phaseLabel, timeAgo } from "@/lib/topic-utils";

export function StudyTopicCard({
  topic,
}: {
  topic: StudyTopic;
}) {
  const pct = Math.round(topic.progress * 100);
  const gradient = topicGradient(topic.topic);
  const conversationTitle = topic.latest_thread.title;
  const showConversation =
    conversationTitle && conversationTitle !== topic.topic;

  return (
    <TooltipProvider>
      <Link
        href={`/threads/${topic.latest_thread.id}`}
        className="block h-full"
      >
        <Card className="relative overflow-hidden pt-0 card-hover transition-all cursor-pointer h-full flex flex-col">
          {/* Gradient header with progress ring */}
          <div
            className={`relative flex items-end justify-end bg-gradient-to-br ${gradient} p-4 h-28`}
          >
            <div className="relative flex items-center justify-center">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-border"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={`${pct * 1.257} 125.7`}
                  strokeLinecap="round"
                  className="text-primary transition-all duration-500"
                />
              </svg>
              <span className="absolute text-xs font-semibold text-foreground">
                {pct}%
              </span>
            </div>
          </div>

          <CardHeader className="min-w-0">
            <CardAction>
              <Badge variant="secondary">{phaseLabel(topic.phase)}</Badge>
            </CardAction>

            {/* Topic — big and bold */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <CardTitle className="text-lg font-bold leading-tight truncate" />
                }
              >
                {topic.topic}
              </TooltipTrigger>
              <TooltipContent side="right">{topic.topic}</TooltipContent>
            </Tooltip>

            {/* Subtopic (current concept) */}
            {topic.current_concept && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <CardDescription className="truncate" />
                  }
                >
                  {topic.current_concept}
                </TooltipTrigger>
                <TooltipContent side="right">{topic.current_concept}</TooltipContent>
              </Tooltip>
            )}

            {/* Conversation title */}
            {showConversation && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <p className="truncate text-xs text-muted-foreground mt-0.5" />
                  }
                >
                  {conversationTitle}
                </TooltipTrigger>
                <TooltipContent side="right">{conversationTitle}</TooltipContent>
              </Tooltip>
            )}
          </CardHeader>

          <CardFooter className="mt-auto flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {timeAgo(topic.latest_thread.updated_at)}
            </span>
            <Button variant="ghost" size="sm">
              Continue <ArrowRight className="ml-1 size-4" />
            </Button>
          </CardFooter>
        </Card>
      </Link>
    </TooltipProvider>
  );
}
