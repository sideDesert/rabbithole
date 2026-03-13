import clsx from "clsx";
import React, { useRef } from "react";
import { Streamdown } from "streamdown";
import { ThinkingOrb } from "./thought-trail";
import type { Branch } from "@/lib/api";
import { useAnnotations } from "@/hooks/use-annotations";

export const ROLE_USER = "user";
export const ROLE_AI = "assistant";

interface ChatMessageInterface {
  id: string;
  content: React.ReactNode;
  role: typeof ROLE_USER | typeof ROLE_AI;
  className?: string;
  isLast?: boolean;
  statusMessage?: string;
  annotations?: Branch[];
}

function lastMessageRef(id: string) {
  return (el: HTMLElement | null) => {
    if (!el) return;

    const parts = id.split("-");
    const index = parseInt(parts[1], 10);
    if (isNaN(index) || index < 1) return;

    const prevMsgId = `msg-${index - 1}`;
    const prevEl = document.querySelector(`[data-message-id="${prevMsgId}"]`);
    if (!prevEl) return;

    const h0 = prevEl.getBoundingClientRect().height;
    el.style.minHeight = `calc(100vh - 220px - ${h0}px)`;
  };
}

export function PhaseDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2 animate-in fade-in duration-300">
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted-foreground tracking-widest uppercase">
        {label}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

export function ChatMessage({
  id,
  content,
  role,
  className,
  isLast,
  statusMessage,
  annotations,
}: ChatMessageInterface) {
  const articleRef = useRef<HTMLElement | null>(null);
  useAnnotations(articleRef, role === ROLE_AI ? annotations : undefined, !!isLast);

  if (role === ROLE_USER) {
    return (
      <div
        className={clsx(
          "chat-message bg-accent py-3 px-3 rounded-xl max-w-[85%]",
          className,
        )}
        data-message-id={id}
      >
        {content}
      </div>
    );
  }
  if (role === ROLE_AI) {
    const showOrb = statusMessage && !(content as string);

    return (
      <article
        className="chat-message max-w-full overflow-auto streamdown"
        data-message-id={id}
        ref={(el) => {
          articleRef.current = el;
          if (!el) return;
          if (isLast) {
            lastMessageRef(id)(el);
          } else {
            el.style.minHeight = "";
          }
        }}
      >
        {showOrb && <ThinkingOrb statusMessage={statusMessage} />}
        <Streamdown>{content as string}</Streamdown>
      </article>
    );
  }

  return null;
}
