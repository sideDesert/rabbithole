"use client";

import {
  ChatMessage,
  ROLE_AI,
  ROLE_USER,
  PhaseDivider,
} from "@/components/chat-message";
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
import { FeynmanModal } from "@/components/feynman-modal";
import { TextSelectionMenu } from "@/components/text-selection-menu";
import { useChat } from "@/hooks/use-chat";
import { useTextSelectionMenu } from "@/hooks/use-text-selection-menu";
import { useBranchout, useBranches } from "@/hooks/use-branch";
import type { Branch } from "@/lib/api";
import { getProgress } from "@/lib/api";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

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
  const router = useRouter();

  const { feynmanRequested, setFeynmanRequested, setThreadId, setTopicSlug } =
    usePlan();

  const [tagged, setTagged] = useState("");
  const [branchMessageId, setBranchMessageId] = useState("");
  const [branchTextPosition, setBranchTextPosition] = useState<
    [number, number] | null
  >(null);
  const [mode, setMode] = useState<Mode>(MODE_DEFAULT);
  const promptRef = useRef<null | HTMLInputElement>(null);

  const {
    send,
    messages,
    isStreaming,
    isLoading,
    threadId,
    interviewQuestions,
    submitInterviewAnswers,
    dismissInterview,
    feynmanOpen,
    feynmanConcept,
    openFeynman,
    dismissFeynman,
  } = useChat({
    onThreadCreated: (id) => setThreadId(id),
    onPlanCreated: (slug) => setTopicSlug(slug),
  });

  useEffect(() => {
    if (threadId) setThreadId(threadId);
  }, [threadId, setThreadId]);

  // Open Feynman modal when Pen tab is clicked
  useEffect(() => {
    if (!feynmanRequested || !threadId) return;
    setFeynmanRequested(false);
    getProgress(threadId)
      .then((progress) => {
        const concept = progress.current_concept;
        if (concept) {
          openFeynman(concept);
        }
      })
      .catch(() => {
        // No plan yet — can't open Feynman mode without a concept
      });
  }, [feynmanRequested, setFeynmanRequested, threadId, openFeynman]);

  const chatStarted = messages.length > 0;

  // Rotating placeholder prompts
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

  const { data: branchData } = useBranches(threadId ?? undefined);

  const {
    selectedText,
    messageId,
    menuPosition,
    isVisible,
    textPosition,
    clearSelection,
  } = useTextSelectionMenu();

  const handleQuote = (data: { messageId: string; text: string }) => {
    setTagged(data.text);
    setMode(MODE_TAGGED);
    requestAnimationFrame(() => promptRef.current?.focus());
  };

  const annotationsByMessage = React.useMemo(() => {
    const map = new Map<string, Branch[]>();
    if (!branchData?.branches) return map;
    for (const b of branchData.branches) {
      if (!b.position) continue;
      const existing = map.get(b.message_id) ?? [];
      existing.push(b);
      map.set(b.message_id, existing);
    }
    return map;
  }, [branchData]);

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
    requestAnimationFrame(() => promptRef.current?.focus());
  };

  return (
    <div className="px-10 pt-4 h-full max-w-3xl m-auto grid grid-rows-[1fr_auto]">
      {chatStarted ? (
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
                isStreaming={messages.length - 1 === index && isStreaming}
                isLoading={messages.length - 1 === index && isLoading}
                statusMessage={msg.statusMessage}
                toolCalls={msg.toolCalls}
                annotations={annotationsByMessage.get(msg.id)}
              />
            );
          })}
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
      {interviewQuestions ? (
        <InterviewWidget
          questions={interviewQuestions}
          onSubmit={submitInterviewAnswers}
          onDismiss={dismissInterview}
          className="sticky! bottom-0 z-50"
        />
      ) : (
        <PromptInput
          ref={promptRef}
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
              if (!threadId) return;
              branch({
                messageId: branchMessageId,
                threadId,
                branchText: tagged,
                textPosition: branchTextPosition ?? undefined,
                title: e,
              });
              return;
            }

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
      {feynmanOpen && feynmanConcept && threadId && (
        <FeynmanModal
          threadId={threadId}
          conceptName={feynmanConcept}
          onClose={dismissFeynman}
        />
      )}
    </div>
  );
}
