"use client";

import { Tree, type NodeRendererProps } from "react-arborist";
import { useRouter, usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, MessageSquare, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThreadTreeNode } from "@/lib/api";
import { useThreadTree } from "@/hooks/use-thread-tree";

type TreeData = ThreadTreeNode;

function Node({ node, style, dragHandle }: NodeRendererProps<TreeData>) {
  const router = useRouter();
  const path = usePathname();
  const isActive = path.includes(node.data.thread_id);
  const isRoot = node.level === 0;

  return (
    <div
      ref={dragHandle}
      style={style}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-sm text-sidebar-foreground",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      onClick={() => router.push(`/threads/${node.data.thread_id}`)}
    >
      {node.isLeaf ? (
        <span className="w-4 shrink-0" />
      ) : (
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-sidebar-accent-foreground/10 active:bg-sidebar-accent-foreground/20 transition-colors"
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

      <span className="truncate">{node.data.title}</span>
    </div>
  );
}

export function ThreadTree() {
  const { trees, isLoading } = useThreadTree();

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
      height={trees.length * 200}
      padding={0}
      className="!overflow-visible"
    >
      {Node}
    </Tree>
  );
}
