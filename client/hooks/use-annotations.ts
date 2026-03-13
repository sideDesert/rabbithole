"use client";

import type { Branch } from "@/lib/api";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Walks text nodes in `container` to find the node and offset
 * corresponding to `targetOffset` characters from the start.
 */
function findTextPosition(
  container: HTMLElement,
  targetOffset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  let accumulated = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent?.length ?? 0;
    if (accumulated + len > targetOffset) {
      return { node, offset: targetOffset - accumulated };
    }
    accumulated += len;
  }
  return null;
}

/**
 * Remove all annotation wrappers from the container,
 * replacing each <a class="branch-annotation"> with its child nodes.
 */
function clearAnnotations(container: HTMLElement) {
  const marks = container.querySelectorAll("a.branch-annotation");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

export function useAnnotations(
  messageRef: React.RefObject<HTMLElement | null>,
  annotations: Branch[] | undefined,
  isStreaming: boolean,
) {
  const router = useRouter();

  useEffect(() => {
    const el = messageRef.current;
    if (!el || !annotations?.length || isStreaming) return;

    // Sort descending by position.start so DOM mutations
    // don't invalidate earlier offsets
    const sorted = annotations
      .filter(
        (a): a is Branch & { position: NonNullable<Branch["position"]> } =>
          a.position !== null,
      )
      .sort((a, b) => b.position.start - a.position.start);

    if (sorted.length === 0) return;

    // Apply annotations
    for (const annotation of sorted) {
      const { start, end } = annotation.position;

      const startPos = findTextPosition(el, start);
      const endPos = findTextPosition(el, end);
      if (!startPos || !endPos) continue;

      try {
        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);

        const link = document.createElement("a");
        link.className = "branch-annotation";
        link.href = `/threads/${annotation.thread_id}`;
        link.title = annotation.title;
        link.dataset.branchId = annotation.branch_point_id;

        // extractContents handles cross-element ranges
        const fragment = range.extractContents();
        link.appendChild(fragment);
        range.insertNode(link);
      } catch {
        // Skip annotations that can't be applied (offset mismatch, etc.)
      }
    }

    // Event delegation for click handling
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.("a.branch-annotation");
      if (target instanceof HTMLAnchorElement) {
        e.preventDefault();
        const href = target.getAttribute("href");
        if (href) router.push(href);
      }
    };
    el.addEventListener("click", handleClick);

    return () => {
      el.removeEventListener("click", handleClick);
      clearAnnotations(el);
    };
  }, [messageRef, annotations, isStreaming, router]);
}
