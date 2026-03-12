"use client";

import { useEffect } from "react";
import { ChatMessage, ROLE_AI, ROLE_USER } from "@/components/chat-message";
import { InterviewAnswersCard } from "@/components/interview-answers-card";
import { InterviewWidget } from "@/components/interview-modal";
import { PlanCreatedCard } from "@/components/plan-created-card";
import { PromptInput } from "@/components/prompt-input";
import { TextSelectionMenu } from "@/components/text-selection-menu";
import { usePlan } from "@/components/plan-context";
import { useChat } from "@/hooks/use-chat";
import { useTextSelectionMenu } from "@/hooks/use-text-selection-menu";
import { getThread } from "@/lib/api";
import { use } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const { setThreadId, setTopicSlug } = usePlan();

  const {
    send,
    messages,
    isStreaming,
    isWaiting,
    interviewQuestions,
    submitInterviewAnswers,
    dismissInterview,
  } = useChat({
    threadId,
    onPlanCreated: (slug) => setTopicSlug(slug),
  });

  useEffect(() => {
    setThreadId(threadId);
    getThread(threadId).then((t) => {
      if (t.topic_slug) setTopicSlug(t.topic_slug);
    });
  }, [threadId, setThreadId, setTopicSlug]);

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
          if (msg.type === "plan_card") {
            return (
              <PlanCreatedCard
                key={msg.id}
                topicSlug={msg.metadata?.topicSlug ?? ""}
              />
            );
          }
          if (
            msg.role === "user" &&
            msg.content.startsWith("[Interview Answers]")
          ) {
            return (
              <div key={msg.id} className="w-fit self-end">
                <InterviewAnswersCard content={msg.content} />
              </div>
            );
          }
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
      {interviewQuestions ? (
        <InterviewWidget
          questions={interviewQuestions}
          onSubmit={submitInterviewAnswers}
          onDismiss={dismissInterview}
          className="sticky! bottom-0 z-50"
        />
      ) : (
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
      )}
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
