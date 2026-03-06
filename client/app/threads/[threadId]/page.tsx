"use client";

import { ChatMessage, ROLE_AI, ROLE_USER } from "@/components/chat-message";
import { PromptInput } from "@/components/prompt-input";
import { TextSelectionMenu } from "@/components/text-selection-menu";
import { useChat } from "@/hooks/use-chat";
import { useTextSelectionMenu } from "@/hooks/use-text-selection-menu";
import { use, useEffect } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);

  const { send, messages, isStreaming, isWaiting } = useChat({ threadId });
  console.log({ messages });

  const { selectedText, messageId, menuPosition, isVisible, clearSelection } =
    useTextSelectionMenu();

  const handleQuote = (data: { messageId: string; text: string }) => {
    console.log("Quote:", data);
    // TODO: insert quoted text into prompt input
  };

  const handleBranch = (data: { messageId: string; text: string }) => {
    console.log("Branch Out:", data);
    // TODO: trigger branch conversation workflow
  };

  return (
    <div className="px-10 pt-4 h-full max-w-3xl m-auto grid grid-rows-[1fr_auto]">
      <div className="flex flex-col overflow-auto relative z-0 gap-4 min-h-0 pb-6">
        {messages.map((msg, index) => {
          return (
            <ChatMessage
              key={msg.id}
              id={msg.id}
              role={msg.role as typeof ROLE_USER | typeof ROLE_AI}
              content={msg.content}
              className={`${msg.role === ROLE_USER && "w-fit self-end"}`}
              isLast={messages.length - 1 === index}
              streaming={isStreaming}
              waiting={isWaiting && messages.length - 1 === index}
            />
          );
        })}
      </div>
      <PromptInput
        onSubmit={(e) => {
          send(e);
          setTimeout(
            () =>
              window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth",
              }),
            50,
          );
        }}
        className="sticky! bottom-0 z-50"
      />
      <TextSelectionMenu
        visible={isVisible}
        position={menuPosition}
        selectedText={selectedText}
        messageId={messageId}
        onQuote={handleQuote}
        onBranch={handleBranch}
        onActionComplete={clearSelection}
      />
    </div>
  );
}
