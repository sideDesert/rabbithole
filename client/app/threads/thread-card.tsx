"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Thread, deleteThread } from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  GitBranch,
  Clock,
  Layers,
  MoreVertical,
  Trash2,
} from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  explored: "secondary",
  mastered: "outline",
};

const PHASE_LABEL: Record<string, string> = {
  interview: "Interviewing",
  planning: "Planning",
  teaching: "Teaching",
  testing: "Testing",
};

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ThreadCard({ thread }: { thread: Thread }) {
  const threadId = thread.root_thread_id ?? thread.evermemos_group_id;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    await deleteThread(threadId);
    router.refresh();
  }

  return (
    <div className="relative group/thread h-full">
      <Link href={`/threads/${threadId}`} className="block h-full">
        <Card
          className={`h-full transition-all duration-200 hover:ring-primary/30 hover:shadow-md hover:shadow-primary/5 ${deleting ? "opacity-50 pointer-events-none" : ""}`}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="group-hover/thread:text-primary transition-colors line-clamp-1">
                {thread.title}
              </CardTitle>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant={STATUS_VARIANT[thread.status] ?? "secondary"}>
                  {thread.status}
                </Badge>
                {thread.phase && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {PHASE_LABEL[thread.phase] ?? thread.phase}
                  </Badge>
                )}
              </div>
            </div>
            {thread.summary && (
              <CardDescription className="line-clamp-2 mt-1">
                {thread.summary}
              </CardDescription>
            )}
          </CardHeader>

          {thread.current_concept && (
            <CardContent className="pt-0">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                <Layers className="size-3" />
                {thread.current_concept}
              </span>
            </CardContent>
          )}

          <CardFooter className="text-xs text-muted-foreground">
            <div className="flex items-center gap-4 w-full">
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3" />
                {thread.agent}
              </span>
              {thread.depth > 0 && (
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="size-3" />
                  depth {thread.depth}
                </span>
              )}
              <span className="inline-flex items-center gap-1 ml-auto">
                <Clock className="size-3" />
                {formatRelative(thread.updated_at)}
              </span>
            </div>
          </CardFooter>
        </Card>
      </Link>

      {/* Dropdown menu overlaid on the card */}
      <div className="absolute top-3 right-3 opacity-0 group-hover/thread:opacity-100 transition-opacity z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="p-1 rounded-md hover:bg-muted"
          >
            <MoreVertical className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5 mr-2" />
              Delete thread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
