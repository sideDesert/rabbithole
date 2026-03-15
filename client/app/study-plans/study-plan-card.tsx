"use client";

import { type StudyTopic } from "@/lib/api";
import { topicGradient, phaseLabel, timeAgo } from "@/lib/topic-utils";
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

export function StudyPlanCard({
  topic,
  onClick,
}: {
  topic: StudyTopic;
  onClick: () => void;
}) {
  const pct = Math.round(topic.progress * 100);
  const gradient = topicGradient(topic.topic);
  const conversationTitle = topic.latest_thread.title;
  const showConversation =
    conversationTitle && conversationTitle !== topic.topic;

  return (
    <TooltipProvider>
      <Card
        className="relative overflow-hidden pt-0 hover:ring-foreground/20 transition-all cursor-pointer h-full flex flex-col"
        onClick={onClick}
      >
        <div
          className={`relative flex items-end justify-end bg-gradient-to-br ${gradient} p-4 h-28`}
        >
          <div className="relative flex items-center justify-center">
            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/10" />
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${pct * 1.257} 125.7`} strokeLinecap="round" className="text-primary transition-all duration-500" />
            </svg>
            <span className="absolute text-xs font-semibold text-foreground">{pct}%</span>
          </div>
        </div>

        <CardHeader className="min-w-0">
          <CardAction>
            <Badge variant="secondary">{phaseLabel(topic.phase)}</Badge>
          </CardAction>
          <Tooltip>
            <TooltipTrigger render={<CardTitle className="text-lg font-bold leading-tight truncate" />}>
              {topic.topic}
            </TooltipTrigger>
            <TooltipContent side="right">{topic.topic}</TooltipContent>
          </Tooltip>
          {topic.current_concept && (
            <Tooltip>
              <TooltipTrigger render={<CardDescription className="truncate" />}>
                {topic.current_concept}
              </TooltipTrigger>
              <TooltipContent side="right">{topic.current_concept}</TooltipContent>
            </Tooltip>
          )}
          {showConversation && (
            <Tooltip>
              <TooltipTrigger render={<p className="truncate text-xs text-muted-foreground/70 mt-0.5" />}>
                {conversationTitle}
              </TooltipTrigger>
              <TooltipContent side="right">{conversationTitle}</TooltipContent>
            </Tooltip>
          )}
        </CardHeader>

        <CardFooter className="mt-auto">
          <span className="text-xs text-muted-foreground">
            {timeAgo(topic.latest_thread.updated_at)}
          </span>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
