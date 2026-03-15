"use client";

import { useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import { useRouter, usePathname } from "next/navigation";
import { AltArrowRightBoldDuotone, AltArrowDownBoldDuotone, ChatSquareBoldDuotone, BranchingPathsDownBoldDuotone, TrashBinMinimalisticBoldDuotone } from "solar-icon-set";
import { cn } from "@/lib/utils";
import type { ThreadTreeNode } from "@/lib/api";
import { deleteThread } from "@/lib/api";
import { useThreadTree } from "@/hooks/use-thread-tree";

type TreeData = ThreadTreeNode;

function Node({ node, style, dragHandle }: NodeRendererProps<TreeData>) {
  const router = useRouter();
  const path = usePathname();
  const { refetch } = useThreadTree();
  const [deleting, setDeleting] = useState(false);
  const isActive = path.includes(node.data.thread_id);
  const isRoot = node.level === 0;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    await deleteThread(node.data.thread_id);
    refetch();
    if (isActive) router.push("/threads");
  }

  return (
    <div
      ref={dragHandle}
      style={style}
      className={cn(
        "group/node flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-sm text-sidebar-foreground",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        deleting && "opacity-50 pointer-events-none",
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
            <AltArrowDownBoldDuotone className="h-3.5 w-3.5" />
          ) : (
            <AltArrowRightBoldDuotone className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {isRoot ? (
        <ChatSquareBoldDuotone className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <BranchingPathsDownBoldDuotone className="h-3.5 w-3.5 shrink-0" />
      )}

      <span className="truncate flex-1">{node.data.title}</span>

      <button
        type="button"
        className="hidden group-hover/node:flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
        onClick={handleDelete}
      >
        <TrashBinMinimalisticBoldDuotone className="h-3 w-3" />
      </button>
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
