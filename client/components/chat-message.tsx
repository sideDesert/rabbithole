import clsx from "clsx";
import React from "react";
import { Streamdown } from "streamdown";

export const ROLE_USER = "user";
export const ROLE_AI = "ai";

interface ChatMessageInterface {
  id: string;
  content: React.ReactNode;
  role: typeof ROLE_USER | typeof ROLE_AI;
  className?: string;
}

export function ChatMessage({
  id,
  content,
  role,
  className,
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
      <div
        className="chat-message max-w-full overflow-auto streamdown"
        data-message-id={id}
      >
        <Streamdown>{content as string}</Streamdown>
      </div>
    );
  }

  return null;
}
