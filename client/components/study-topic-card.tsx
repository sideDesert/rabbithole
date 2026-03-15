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

const GRADIENTS = [
  // Purples & violets
  "from-violet-600/30 via-indigo-500/20 to-purple-700/10",
  "from-purple-500/30 via-violet-400/20 to-fuchsia-600/10",
  "from-indigo-600/30 via-purple-500/20 to-violet-700/10",
  "from-fuchsia-500/30 via-purple-400/20 to-indigo-600/10",
  "from-violet-500/30 via-fuchsia-400/20 to-purple-600/10",
  "from-purple-600/30 via-indigo-400/20 to-violet-500/10",
  "from-indigo-500/30 via-violet-600/20 to-purple-400/10",
  "from-fuchsia-600/30 via-violet-500/20 to-purple-700/10",
  "from-violet-700/30 via-purple-500/20 to-indigo-400/10",
  "from-purple-400/30 via-fuchsia-500/20 to-violet-600/10",
  // Blues & cyans
  "from-blue-600/30 via-cyan-500/20 to-indigo-700/10",
  "from-sky-500/30 via-blue-400/20 to-cyan-600/10",
  "from-cyan-600/30 via-sky-500/20 to-blue-700/10",
  "from-blue-500/30 via-indigo-400/20 to-sky-600/10",
  "from-sky-600/30 via-cyan-400/20 to-blue-500/10",
  "from-indigo-500/30 via-blue-600/20 to-cyan-400/10",
  "from-cyan-500/30 via-blue-400/20 to-sky-700/10",
  "from-blue-700/30 via-sky-500/20 to-cyan-600/10",
  "from-sky-400/30 via-indigo-500/20 to-blue-600/10",
  "from-cyan-400/30 via-blue-500/20 to-indigo-600/10",
  // Greens & teals
  "from-emerald-600/30 via-teal-500/20 to-green-700/10",
  "from-green-500/30 via-emerald-400/20 to-teal-600/10",
  "from-teal-600/30 via-green-500/20 to-emerald-700/10",
  "from-emerald-500/30 via-green-600/20 to-teal-400/10",
  "from-green-600/30 via-teal-400/20 to-emerald-500/10",
  "from-teal-500/30 via-emerald-600/20 to-green-400/10",
  "from-green-400/30 via-teal-500/20 to-emerald-600/10",
  "from-emerald-400/30 via-green-500/20 to-teal-700/10",
  "from-teal-700/30 via-emerald-500/20 to-green-600/10",
  "from-green-700/30 via-emerald-400/20 to-teal-500/10",
  // Ambers & oranges
  "from-amber-600/30 via-orange-500/20 to-yellow-700/10",
  "from-orange-500/30 via-amber-400/20 to-yellow-600/10",
  "from-yellow-600/30 via-amber-500/20 to-orange-700/10",
  "from-amber-500/30 via-yellow-400/20 to-orange-600/10",
  "from-orange-600/30 via-yellow-500/20 to-amber-400/10",
  "from-yellow-500/30 via-orange-400/20 to-amber-700/10",
  "from-amber-400/30 via-orange-600/20 to-yellow-500/10",
  "from-orange-700/30 via-amber-500/20 to-yellow-400/10",
  "from-yellow-400/30 via-amber-600/20 to-orange-500/10",
  "from-orange-400/30 via-yellow-600/20 to-amber-500/10",
  // Roses & pinks
  "from-rose-600/30 via-pink-500/20 to-red-700/10",
  "from-pink-500/30 via-rose-400/20 to-fuchsia-600/10",
  "from-red-600/30 via-rose-500/20 to-pink-700/10",
  "from-rose-500/30 via-red-400/20 to-pink-600/10",
  "from-pink-600/30 via-fuchsia-400/20 to-rose-500/10",
  "from-red-500/30 via-pink-400/20 to-rose-700/10",
  "from-fuchsia-500/30 via-rose-400/20 to-pink-600/10",
  "from-rose-400/30 via-pink-600/20 to-red-500/10",
  "from-pink-700/30 via-rose-500/20 to-fuchsia-400/10",
  "from-red-400/30 via-rose-600/20 to-pink-500/10",
  // Cross-hue blends
  "from-violet-500/30 via-blue-400/20 to-cyan-600/10",
  "from-blue-500/30 via-teal-400/20 to-emerald-600/10",
  "from-emerald-500/30 via-yellow-400/20 to-amber-600/10",
  "from-amber-500/30 via-rose-400/20 to-pink-600/10",
  "from-pink-500/30 via-violet-400/20 to-indigo-600/10",
  "from-cyan-500/30 via-emerald-400/20 to-green-600/10",
  "from-indigo-500/30 via-cyan-400/20 to-teal-600/10",
  "from-teal-500/30 via-blue-400/20 to-indigo-600/10",
  "from-rose-500/30 via-amber-400/20 to-yellow-600/10",
  "from-fuchsia-500/30 via-pink-400/20 to-rose-600/10",
  // Warm-cool contrasts
  "from-rose-600/30 via-violet-400/20 to-blue-500/10",
  "from-amber-600/30 via-emerald-400/20 to-teal-500/10",
  "from-orange-500/30 via-pink-400/20 to-purple-600/10",
  "from-yellow-500/30 via-green-400/20 to-cyan-600/10",
  "from-red-500/30 via-indigo-400/20 to-blue-600/10",
  "from-pink-600/30 via-sky-400/20 to-cyan-500/10",
  "from-amber-500/30 via-violet-400/20 to-purple-600/10",
  "from-rose-500/30 via-teal-400/20 to-emerald-600/10",
  "from-orange-600/30 via-blue-400/20 to-indigo-500/10",
  "from-fuchsia-600/30 via-cyan-400/20 to-teal-500/10",
  // Moody & deep
  "from-slate-600/30 via-indigo-500/20 to-violet-700/10",
  "from-zinc-500/30 via-purple-400/20 to-fuchsia-600/10",
  "from-stone-600/30 via-amber-500/20 to-orange-700/10",
  "from-gray-500/30 via-blue-400/20 to-cyan-600/10",
  "from-neutral-600/30 via-emerald-500/20 to-teal-700/10",
  "from-slate-500/30 via-rose-400/20 to-pink-600/10",
  "from-zinc-600/30 via-sky-500/20 to-blue-700/10",
  "from-stone-500/30 via-green-400/20 to-emerald-600/10",
  "from-gray-600/30 via-violet-500/20 to-purple-700/10",
  "from-neutral-500/30 via-orange-400/20 to-amber-600/10",
  // Vibrant pops
  "from-lime-500/30 via-green-400/20 to-emerald-600/10",
  "from-lime-600/30 via-yellow-400/20 to-amber-500/10",
  "from-sky-600/30 via-violet-400/20 to-fuchsia-500/10",
  "from-teal-600/30 via-cyan-400/20 to-sky-500/10",
  "from-fuchsia-600/30 via-pink-500/20 to-rose-400/10",
  "from-emerald-600/30 via-cyan-500/20 to-sky-400/10",
  "from-violet-600/30 via-rose-400/20 to-pink-500/10",
  "from-blue-600/30 via-emerald-400/20 to-green-500/10",
  "from-pink-600/30 via-amber-400/20 to-orange-500/10",
  "from-indigo-600/30 via-teal-400/20 to-emerald-500/10",
];

/** Deterministic gradient based on topic name so the same topic always gets the same color */
function topicGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function phaseLabel(phase: string) {
  if (phase === "interview") return "Interview";
  if (phase === "planning") return "Planning";
  if (phase === "teaching") return "Learning";
  return phase;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

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
        <Card className="relative overflow-hidden pt-0 hover:ring-foreground/20 transition-all cursor-pointer h-full flex flex-col">
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
                  className="text-foreground/10"
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
                    <p className="truncate text-xs text-muted-foreground/70 mt-0.5" />
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
