import clsx from "clsx";
import React from "react";
import { Streamdown } from "streamdown";

export const ROLE_USER = "user";
export const ROLE_AI = "assistant";

interface ChatMessageInterface {
  id: string;
  content: React.ReactNode;
  role: typeof ROLE_USER | typeof ROLE_AI;
  className?: string;
  isLast?: boolean;
  waiting?: boolean;
  streaming?: boolean;
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

export function ChatMessage({
  id,
  content,
  role,
  className,
  isLast,
  waiting,
  streaming,
}: ChatMessageInterface) {
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
    return (
      <>
        <article
          className={`chat-message max-w-full overflow-auto streamdown`}
          data-message-id={id}
          ref={(el) => {
            if (!el) return;
            if (isLast) {
              lastMessageRef(id)(el);
            } else {
              el.style.minHeight = "";
            }
          }}
        >
          {isLast && waiting && <div className="thinking-orb" />}
          <Streamdown>{content as string}</Streamdown>
          {isLast && !waiting && streaming && (
            <div className="gap-2 justify-center items-center mt-2 inline-flex">
              <div className="gradient-spinner " />{" "}
              <span className="text-muted-foreground text-sm">Streaming</span>
            </div>
          )}
        </article>
      </>
    );
  }

  return null;
}
