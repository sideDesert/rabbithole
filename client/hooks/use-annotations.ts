"use client";

import type { Branch } from "@/lib/api";
import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";

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

/**
 * Collect all text nodes between startPos and endPos (inclusive).
 */
function getTextNodesInRange(
  container: HTMLElement,
  startPos: { node: Text; offset: number },
  endPos: { node: Text; offset: number },
): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let inRange = false;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node === startPos.node) inRange = true;
    if (inRange) nodes.push(node);
    if (node === endPos.node) break;
  }
  return nodes;
}

function applyAnnotations(el: HTMLElement, annotations: Branch[]) {
  clearAnnotations(el);

  const sorted = annotations
    .filter(
      (a): a is Branch & { position: NonNullable<Branch["position"]> } =>
        a.position !== null,
    )
    .sort((a, b) => b.position.start - a.position.start);

  for (const annotation of sorted) {
    const { start, end } = annotation.position;
    const startPos = findTextPosition(el, start);
    const endPos = findTextPosition(el, end);
    if (!startPos || !endPos) continue;

    try {
      const textNodes = getTextNodesInRange(el, startPos, endPos);

      for (const textNode of textNodes) {
        const wrapStart = textNode === startPos.node ? startPos.offset : 0;
        const wrapEnd = textNode === endPos.node ? endPos.offset : textNode.textContent!.length;

        if (wrapStart >= wrapEnd) continue;

        const range = document.createRange();
        range.setStart(textNode, wrapStart);
        range.setEnd(textNode, wrapEnd);

        const link = document.createElement("a");
        link.className = "branch-annotation";
        link.href = `/threads/${annotation.thread_id}`;
        link.dataset.tooltip = annotation.first_message || annotation.title || "";
        link.dataset.branchId = annotation.branch_point_id;

        range.surroundContents(link);
      }
    } catch (err) {
      console.error("[annotations] failed to apply", err);
    }
  }
}

// Persistent tooltips that are always visible
const tooltipMap = new Map<string, HTMLDivElement>();

function getContainerRight(): number {
  const container = document.querySelector(".max-w-3xl");
  if (container) return container.getBoundingClientRect().right;
  return window.innerWidth - 32;
}

function positionTooltips(el: HTMLElement) {
  const links = Array.from(el.querySelectorAll("a.branch-annotation"));
  const right = getContainerRight() + 52;

  // Collect desired positions sorted by vertical position
  const items: { branchId: string; desiredTop: number }[] = [];
  for (const link of links) {
    const branchId = (link as HTMLElement).dataset.branchId;
    if (!branchId || !tooltipMap.has(branchId)) continue;
    const rect = link.getBoundingClientRect();
    items.push({ branchId, desiredTop: rect.top + rect.height / 2 });
  }
  items.sort((a, b) => a.desiredTop - b.desiredTop);

  // Resolve overlaps — push each tooltip below the previous if they collide
  let lastBottom = -Infinity;
  for (const item of items) {
    const tip = tooltipMap.get(item.branchId)!;
    const tipHeight = tip.offsetHeight;
    let top = item.desiredTop - tipHeight / 2;

    if (top < lastBottom + 4) {
      top = lastBottom + 4;
    }

    tip.style.left = `${right}px`;
    tip.style.top = `${top}px`;
    tip.style.transform = "";
    lastBottom = top + tipHeight;
  }
}

function clampTooltip(tip: HTMLDivElement) {
  const left = tip.getBoundingClientRect().left;
  const overflow = left + tip.offsetWidth - window.innerWidth + 8;
  if (overflow > 0) {
    tip.style.left = `${parseFloat(tip.style.left) - overflow}px`;
  }
}

function unclampTooltip(tip: HTMLDivElement, el: HTMLElement) {
  const right = getContainerRight() + 52;
  tip.style.left = `${right}px`;
}

function createTooltips(el: HTMLElement) {
  clearTooltips();
  const links = el.querySelectorAll("a.branch-annotation");
  links.forEach((link) => {
    const text = (link as HTMLElement).dataset.tooltip;
    const branchId = (link as HTMLElement).dataset.branchId;
    if (!text || !branchId) return;

    const tip = document.createElement("div");
    tip.className = "branch-tooltip";
    tip.textContent = text;
    tip.dataset.branchId = branchId;
    document.body.appendChild(tip);

    tip.addEventListener("mouseenter", () => {
      tip.classList.add("branch-tooltip--active");
      clampTooltip(tip);
    });
    tip.addEventListener("mouseleave", () => {
      tip.classList.remove("branch-tooltip--active");
      unclampTooltip(tip, el);
    });

    tooltipMap.set(branchId, tip);
  });

  positionTooltips(el);
}

function clearTooltips() {
  tooltipMap.forEach((tip) => tip.remove());
  tooltipMap.clear();
}

export function useAnnotations(
  messageRef: React.RefObject<HTMLElement | null>,
  annotations: Branch[] | undefined,
  isStreaming: boolean,
) {
  const router = useRouter();

  useLayoutEffect(() => {
    const el = messageRef.current;
    if (!el || !annotations?.length || isStreaming) return;

    const contentEl = el.querySelector(".chat-message-content") as HTMLElement ?? el;
    applyAnnotations(contentEl, annotations);

    // Create persistent tooltips after a frame so layout is settled
    requestAnimationFrame(() => {
      createTooltips(el);

      // Add click handlers to tooltips for navigation
      tooltipMap.forEach((tip, branchId) => {
        tip.addEventListener("click", () => {
          const link = el.querySelector(`a.branch-annotation[data-branch-id="${branchId}"]`) as HTMLAnchorElement | null;
          const href = link?.getAttribute("href");
          if (href) router.push(href);
        });
      });
    });

    // Reposition on scroll/resize
    const reposition = () => positionTooltips(el);
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition, { passive: true });

    // Highlight tooltip on annotation hover
    const handleOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.("a.branch-annotation") as HTMLElement | null;
      if (!target) return;
      const branchId = target.dataset.branchId;
      if (!branchId) return;
      const tip = tooltipMap.get(branchId);
      if (tip) {
        tip.classList.add("branch-tooltip--active");
        clampTooltip(tip);
      }
    };

    const handleOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.("a.branch-annotation") as HTMLElement | null;
      const related = (e.relatedTarget as HTMLElement)?.closest?.("a.branch-annotation") as HTMLElement | null;
      if (target && target !== related) {
        const branchId = target.dataset.branchId;
        if (!branchId) return;
        const tip = tooltipMap.get(branchId);
        if (tip) {
          tip.classList.remove("branch-tooltip--active");
          unclampTooltip(tip, el);
        }
      }
    };

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.("a.branch-annotation");
      if (target instanceof HTMLAnchorElement) {
        e.preventDefault();
        const href = target.getAttribute("href");
        if (href) router.push(href);
      }
    };

    el.addEventListener("click", handleClick);
    el.addEventListener("mouseover", handleOver);
    el.addEventListener("mouseout", handleOut);

    return () => {
      el.removeEventListener("click", handleClick);
      el.removeEventListener("mouseover", handleOver);
      el.removeEventListener("mouseout", handleOut);
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
      clearTooltips();
      clearAnnotations(contentEl);
    };
  }, [annotations, isStreaming, router]);
}
