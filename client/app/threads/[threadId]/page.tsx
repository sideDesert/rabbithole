"use client";

import { ChatMessage, ROLE_AI, ROLE_USER, PhaseDivider } from "@/components/chat-message";
import { InterviewAnswersCard } from "@/components/interview-answers-card";
import { InterviewWidget } from "@/components/interview-modal";
import { PlanCreatedCard } from "@/components/plan-created-card";
import { usePlan } from "@/components/plan-context";
import {
  Mode,
  MODE_BRANCH,
  MODE_DEFAULT,
  MODE_TAGGED,
  PromptInput,
} from "@/components/prompt-input";
import { TextSelectionMenu } from "@/components/text-selection-menu";
import { useChat } from "@/hooks/use-chat";
import { useTextSelectionMenu } from "@/hooks/use-text-selection-menu";
import { useBranchout } from "@/hooks/use-branch";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const { setThreadId, setTopicSlug } = usePlan();
  const router = useRouter();
  const [tagged, setTagged] = useState("");
  const [branchMessageId, setBranchMessageId] = useState("");
  const [branchTextPosition, setBranchTextPosition] = useState<
    [number, number] | null
  >(null);
  const [mode, setMode] = useState<Mode>(MODE_DEFAULT);

  const searchParams = useSearchParams();
  const pendingMsg = searchParams.get("msg");
  const sentPendingRef = useRef(false);
  const scrollToId = searchParams.get("scrollTo");
  const scrolledRef = useRef(false);

  // Sync route param into PlanContext so PlanView can fetch progress
  useEffect(() => {
    setThreadId(threadId);
  }, [threadId, setThreadId]);

  const {
    send,
    messages,
    isMessagesLoading,
    isStreaming,
    phase,
    interviewQuestions,
    submitInterviewAnswers,
    dismissInterview,
    toggleTrailCollapsed,
  } = useChat({
    threadId,
    onPlanCreated: (slug) => setTopicSlug(slug),
  });

  // Auto-send message passed via query param (from branch navigation)
  useEffect(() => {
    console.log({ pendingMsg, mode });
    if (
      pendingMsg &&
      !sentPendingRef.current &&
      mode === MODE_DEFAULT &&
      !isMessagesLoading &&
      messages.length === 0
    ) {
      sentPendingRef.current = true;
      send(pendingMsg);
    }
  }, [pendingMsg, send, threadId, router, mode, messages, isMessagesLoading]);

  useEffect(() => {
    if (
      scrollToId &&
      !isMessagesLoading &&
      messages.length > 0 &&
      !scrolledRef.current
    ) {
      scrolledRef.current = true;
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-message-id="${scrollToId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("scroll-highlight");
          setTimeout(() => el.classList.remove("scroll-highlight"), 2000);
        }
      });
    }
  }, [scrollToId, isMessagesLoading, messages]);

  console.log({ messages });
  const {
    selectedText,
    messageId,
    menuPosition,
    isVisible,
    textPosition,
    clearSelection,
  } = useTextSelectionMenu();

  const handleQuote = (data: { messageId: string; text: string }) => {
    console.log("Quote:", data);
    setTagged(data.text);
    setMode(MODE_TAGGED);
    // TODO: insert quoted text into prompt input
  };

  const { branch, isPending: isBranching } = useBranchout({
    onSuccess: (res, vars) => {
      router.push(
        `/threads/${res.thread_id}?msg=${encodeURIComponent(vars.title ?? tagged)}`,
      );
    },
  });

  const handleBranch = async (data: { messageId: string; text: string }) => {
    setTagged(data.text);
    setBranchMessageId(data.messageId);
    setBranchTextPosition(textPosition);
    setMode(MODE_BRANCH);
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
          if (msg.type === "phase_divider") {
            return <PhaseDivider key={msg.id} label={msg.content} />;
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
              trailSteps={msg.trailSteps}
              trailCollapsed={msg.trailCollapsed}
              onTrailToggle={() => toggleTrailCollapsed(msg.id)}
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
          mode={mode}
          tagged={tagged}
          loading={isBranching}
          onClose={() => {
            setTagged("");
            setMode(MODE_DEFAULT);
          }}
          onSubmit={async (e) => {
            if (mode === MODE_DEFAULT) {
              send(e);
            }
            if (mode === MODE_TAGGED) {
              const mod = `\
                I am quoting your previous message - "${tagged}"
                Keeping this in mind : ${e}\
              `;
              send(mod);
            }
            if (mode === MODE_BRANCH) {
              branch({
                messageId: branchMessageId,
                threadId,
                branchText: tagged,
                textPosition: branchTextPosition ?? undefined,
                title: e,
              });
              return;
            }

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
