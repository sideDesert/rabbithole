import clsx from "clsx";
import React, { useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { ThinkingOrb } from "./thought-trail";
import type { Branch } from "@/lib/api";
import type { ToolCallEntry } from "@/hooks/use-chat";
import { useAnnotations } from "@/hooks/use-annotations";

export const ROLE_USER = "user";
export const ROLE_AI = "assistant";

interface ChatMessageInterface {
  id: string;
  content: React.ReactNode;
  role: typeof ROLE_USER | typeof ROLE_AI;
  className?: string;
  isLast?: boolean;
  isStreaming?: boolean;
  isLoading?: boolean;
  statusMessage?: string;
  toolCalls?: ToolCallEntry[];
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

function ToolCallBlock({ tc }: { tc: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  const isDone = tc.status === "done";

  return (
    <div>
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
        onClick={() => tc.result && setOpen(!open)}
      >
        {isDone ? (
          <span className="text-emerald-500 text-xs">&#10003;</span>
        ) : (
          <span className="thinking-orb shrink-0 !w-3 !h-3" />
        )}
        <span>{tc.label}</span>
      </button>
      {open && tc.result && (
        <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1 mb-2 overflow-x-auto whitespace-pre-wrap">
          {tc.result}
        </pre>
      )}
    </div>
  );
}

export function ChatMessage({
  id,
  content,
  role,
  className,
  isLast,
  isStreaming,
  isLoading,
  statusMessage,
  toolCalls,
  annotations,
}: ChatMessageInterface) {
  const articleRef = useRef<HTMLElement | null>(null);
  useAnnotations(
    articleRef,
    role === ROLE_AI ? annotations : undefined,
    !!isStreaming,
  );

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
    const hasToolCalls = toolCalls && toolCalls.length > 0;

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
        {isLoading && (
          <ThinkingOrb statusMessage={statusMessage ?? "Loading"} />
        )}
        {hasToolCalls && (
          <div className="mb-3 border-l-2 border-border pl-3 space-y-0.5">
            {toolCalls.map((tc, i) => (
              <ToolCallBlock key={`${tc.name}-${i}`} tc={tc} />
            ))}
          </div>
        )}
        <Streamdown>{content as string}</Streamdown>
      </article>
    );
  }

  return null;
}
