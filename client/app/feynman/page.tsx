"use client";
import { useState, useEffect } from "react";
import { ChatMessage, ROLE_AI, ROLE_USER } from "@/components/chat-message";
import { PromptInput } from "@/components/prompt-input";
import { TextSelectionMenu } from "@/components/text-selection-menu";
import { useTextSelectionMenu } from "@/hooks/use-text-selection-menu";
import { useChat } from "@/hooks/use-chat";

const prompts = [
  "How does gravity actually work?",
  "Explain quantum entanglement like I'm five",
  "Why do we dream?",
  "How does a neural network learn?",
  "What causes inflation in an economy?",
  "How does photosynthesis convert sunlight to energy?",
  "Why is the sky blue but sunsets are red?",
  "How do vaccines train your immune system?",
  "What makes music sound harmonious?",
  "How does encryption keep data secure?",
  "Why do we forget things?",
  "How do black holes form?",
  "What is the theory of relativity?",
  "How does DNA store information?",
  "Why do languages evolve over time?",
  "How does a blockchain work?",
  "What causes tides in the ocean?",
  "How do compilers translate code?",
  "Why is biodiversity important?",
  "How does the human brain process language?",
];

export default function Page() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const { send, messages, isStreaming, isWaiting } = useChat({});

  const chatStarted = messages.length > 0;

  useEffect(() => {
    if (chatStarted) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % prompts.length);
        setVisible(true);
      }, 600);
    }, 6000);
    return () => clearInterval(interval);
  }, [chatStarted]);

  const { selectedText, messageId, menuPosition, isVisible, clearSelection } =
    useTextSelectionMenu();

  const handleQuote = (data: { messageId: string; text: string }) => {
    console.log("Quote:", data);
  };

  const handleBranch = (data: { messageId: string; text: string }) => {
    console.log("Branch Out:", data);
  };

  return (
    <div className="px-10 pt-4 h-full max-w-3xl m-auto grid grid-rows-[1fr_auto]">
      {chatStarted ? (
        <div className="flex flex-col overflow-auto relative z-0 gap-4 min-h-0 pb-6">
          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              id={msg.id}
              role={msg.role as typeof ROLE_USER | typeof ROLE_AI}
              content={msg.content}
              className={`${msg.role === ROLE_USER && "w-fit self-end"}`}
              isLast={messages.length - 1 === idx}
              streaming={isStreaming}
              waiting={isWaiting && messages.length - 1 === idx}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col justify-center items-center gap-2">
          <h2 className="text-3xl font-semibold">What do you want to learn?</h2>
          <p
            className="text-lg text-muted-foreground transition-opacity duration-600"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {prompts[index]}
          </p>
        </div>
      )}
      <PromptInput
        className="sticky! bottom-0 z-50"
        onSubmit={(content) => {
          send(content);
          if (chatStarted) {
            setTimeout(
              () =>
                window.scrollTo({
                  top: document.body.scrollHeight,
                  behavior: "smooth",
                }),
              50,
            );
          }
        }}
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
