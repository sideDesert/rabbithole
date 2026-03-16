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
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

function ProgressRing({ progress }: { progress: number }) {
  const deg = Math.round(progress * 360);
  return (
    <div
      className="rounded-full shrink-0 transition-all duration-500"
      style={{
        width: 56,
        height: 56,
        background: `conic-gradient(var(--primary) ${deg}deg, color-mix(in srgb, var(--primary) 15%, transparent) ${deg}deg)`,
        mask: "radial-gradient(farthest-side, transparent calc(50% - 4px), #000 calc(50% - 3px), #000 50%, transparent 51%)",
        WebkitMask:
          "radial-gradient(farthest-side, transparent calc(50% - 4px), #000 calc(50% - 3px), #000 50%, transparent 51%)",
      }}
    />
  );
}

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
    <Card
      className="relative overflow-hidden pt-0 hover:ring-foreground/20 transition-all cursor-pointer h-full flex flex-col"
      onClick={onClick}
    >
      <div
        className={`relative flex items-end justify-end bg-gradient-to-br ${gradient} p-4 h-28`}
      >
        <div className="relative flex items-center justify-center">
          <ProgressRing progress={topic.progress} />
          <span className="absolute text-xs font-semibold text-foreground">
            {pct}%
          </span>
        </div>
      </div>

      <CardHeader className="min-w-0">
        <CardAction>
          <Badge variant="secondary">{phaseLabel(topic.phase)}</Badge>
        </CardAction>
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
        {topic.current_concept && (
          <Tooltip>
            <TooltipTrigger
              render={<CardDescription className="truncate" />}
            >
              {topic.current_concept}
            </TooltipTrigger>
            <TooltipContent side="right">
              {topic.current_concept}
            </TooltipContent>
          </Tooltip>
        )}
        {showConversation && (
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="truncate text-xs text-muted-foreground/70 mt-0.5" />
              }
            >
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
  );
}
