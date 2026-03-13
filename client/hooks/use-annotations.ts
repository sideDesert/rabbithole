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

const BRANCH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`;

function showTooltip(anchor: HTMLElement) {
  const existing = document.querySelector(".branch-tooltip");
  if (existing) existing.remove();

  const text = anchor.dataset.tooltip;
  if (!text) return;

  // Read CSS custom properties from document root
  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue("--primary").trim();
  const popover = styles.getPropertyValue("--popover").trim();
  const popoverFg = styles.getPropertyValue("--popover-foreground").trim();
  const border = styles.getPropertyValue("--border").trim();

  const tooltip = document.createElement("div");
  tooltip.className = "branch-tooltip";

  // Build icon with explicit color
  const iconSpan = document.createElement("span");
  iconSpan.style.cssText = `flex-shrink:0;display:flex;align-items:center;color:${primary}`;
  iconSpan.innerHTML = BRANCH_ICON_SVG;

  const textSpan = document.createElement("span");
  textSpan.textContent = text;

  tooltip.appendChild(iconSpan);
  tooltip.appendChild(textSpan);

  // Apply all styles inline so they work regardless of where tooltip is in DOM
  tooltip.style.cssText = `
    position:absolute;
    display:flex;
    align-items:center;
    gap:8px;
    padding:10px 14px;
    background:${popover};
    color:${popoverFg};
    border:1px solid ${border};
    border-radius:8px;
    font-size:0.875rem;
    line-height:1.5;
    max-width:420px;
    pointer-events:none;
    z-index:50;
    box-shadow:0 4px 12px oklch(0 0 0 / 0.12);
    animation:annotation-tooltip-in 0.2s ease-out;
`;

  document.body.appendChild(tooltip);

  const rect = anchor.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 8}px`;
}

function hideTooltip() {
  const existing = document.querySelector(".branch-tooltip");
  if (existing) existing.remove();
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

    const sorted = annotations
      .filter(
        (a): a is Branch & { position: NonNullable<Branch["position"]> } =>
          a.position !== null,
      )
      .sort((a, b) => b.position.start - a.position.start);

    if (sorted.length === 0) return;

    // Defer so Streamdown finishes its DOM work first
    const rafId = requestAnimationFrame(() => {
      if (!el) return;
      // Clean slate — remove any leftover wrappers
      clearAnnotations(el);

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
          link.dataset.tooltip = annotation.title || "";
          link.dataset.branchId = annotation.branch_point_id;

          const fragment = range.extractContents();
          link.appendChild(fragment);
          range.insertNode(link);
        } catch (err) {
          console.error("[annotations] failed to apply", err);
        }
      }
    });

    // Event delegation for click and hover
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.("a.branch-annotation");
      if (target instanceof HTMLAnchorElement) {
        e.preventDefault();
        hideTooltip();
        const href = target.getAttribute("href");
        if (href) router.push(href);
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.("a.branch-annotation");
      if (target instanceof HTMLElement) showTooltip(target);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.("a.branch-annotation");
      const related = (e.relatedTarget as HTMLElement)?.closest?.(
        "a.branch-annotation",
      );
      if (target && target !== related) hideTooltip();
    };

    el.addEventListener("click", handleClick);
    el.addEventListener("mouseover", handleMouseOver);
    el.addEventListener("mouseout", handleMouseOut);

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("click", handleClick);
      el.removeEventListener("mouseover", handleMouseOver);
      el.removeEventListener("mouseout", handleMouseOut);
      hideTooltip();
      clearAnnotations(el);
    };
  }, [messageRef, annotations, isStreaming, router]);
}
