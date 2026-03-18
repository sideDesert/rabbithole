"use client";

import { useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import { useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  MessageSquare,
  GitBranch,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { ThreadTreeNode } from "@/lib/api";
import { deleteThread } from "@/lib/api";
import { useThreadTree } from "@/hooks/use-thread-tree";

type TreeData = ThreadTreeNode;

function hasDescendant(n: TreeData, threadId: string): boolean {
  for (const child of n.children) {
    if (child.thread_id === threadId || hasDescendant(child, threadId))
      return true;
  }
  return false;
}

function Node({ node, style, dragHandle }: NodeRendererProps<TreeData>) {
  const router = useRouter();
  const path = usePathname();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const isActive = path.includes(node.data.thread_id);
  const isAncestor =
    !isActive &&
    !node.isLeaf &&
    hasDescendant(node.data, path.split("/threads/")[1] ?? "");
  const isRoot = node.level === 0;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    await deleteThread(node.data.thread_id);
    queryClient.invalidateQueries({ queryKey: ["thread-tree"] });
    if (isActive) router.push("/feynman");
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            ref={dragHandle}
            style={style}
            className={cn(
              "group/node flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-sm text-sidebar-foreground",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive &&
                "bg-sidebar-accent text-sidebar-accent-foreground border-2 border-border font-medium rounded-none",
              !isActive &&
                isAncestor &&
                "bg-secondary/80 text-secondary-foreground border-2 border-border rounded-none",
              deleting && "opacity-50 pointer-events-none",
            )}
            onClick={() => router.push(`/threads/${node.data.thread_id}`)}
          />
        }
      >
        {node.isLeaf ? (
          <span className="w-4 shrink-0" />
        ) : (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent active:bg-sidebar-accent transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              node.toggle();
            }}
          >
            {node.isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        )}

        {isRoot ? (
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="truncate flex-1">{node.data.title}</span>

        {node.data.depth === 0 && (
          <Badge
            variant="secondary"
            className="gap-1 text-[10px] px-1.5 py-0 border-2 bg-background border-border text-foreground dark:bg-black dark:text-white"
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                node.data.phase === "interview" && "bg-accent",
                node.data.phase === "planning" && "bg-secondary",
                node.data.phase === "teaching" && "bg-primary",
              )}
            />
            {node.data.phase}
          </Badge>
        )}
        {node.data.depth > 0 && (
          <Badge
            variant="secondary"
            className="gap-1 text-[10px] px-1.5 py-0 border-2 border-border bg-background text-foreground/70"
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                node.data.status === "active" && "bg-emerald-500",
                node.data.status === "explored" && "bg-muted-foreground",
                node.data.status === "mastered" && "bg-amber-500",
              )}
            />
            {node.data.status}
          </Badge>
        )}

      <button
        type="button"
        className="hidden group-hover/node:flex h-5 w-5 shrink-0 items-center justify-center rounded-md hover:bg-destructive/20 text-white hover:text-destructive transition-colors"
        onClick={handleDelete}
      >
        <Trash2 className="h-3 w-3" />
      </button>
      </TooltipTrigger>
      <TooltipContent side="right">{node.data.title}</TooltipContent>
    </Tooltip>
  );
}

export function ThreadTree({ agent }: { agent?: string }) {
  const { trees, isLoading } = useThreadTree(agent);

  if (isLoading) {
    return (
      <p className="px-2 py-3 text-sm text-muted-foreground">Loading...</p>
    );
  }

  if (trees.length === 0) {
    return (
      <p className="px-2 py-3 text-sm text-muted-foreground">
        No conversations yet
      </p>
    );
  }

  return (
    <TooltipProvider>
    <Tree<TreeData>
      data={trees}
      idAccessor="thread_id"
      childrenAccessor={(d) => (d.children.length > 0 ? d.children : null)}
      openByDefault={false}
      disableDrag
      disableDrop
      disableEdit
      disableMultiSelection
      indent={16}
      rowHeight={32}
      width="100%"
      padding={0}
      className="h-fit!"
    >
      {Node}
    </Tree>
    </TooltipProvider>
  );
}
