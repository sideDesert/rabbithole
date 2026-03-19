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
import { BranchSuggestionCard } from "@/components/branch-suggestion-card";
import { FeynmanModal } from "@/components/feynman-modal";
import { TextSelectionMenu } from "@/components/text-selection-menu";
import { useChat } from "@/hooks/use-chat";
import { useTextSelectionMenu } from "@/hooks/use-text-selection-menu";
import { useBranchout, useBranches } from "@/hooks/use-branch";
import { PhaseActionButton } from "@/components/phase-action-button";
import type { Branch } from "@/lib/api";
import { getProgress, startPhase, createNextPhaseThread } from "@/lib/api";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useThemePersonality } from "@/components/theme-personality-provider";
import Image from "next/image";

interface ChatPageProps {
  agent: "feynman" | "ebbinghaus";
  greeting?: React.ReactNode;
  suggestions?: string[];
}

export function FeynmanGreeting({ prompts }: { prompts: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const { activeTheme } = useThemePersonality();
  const logoClass =
    activeTheme.id === "classic"
      ? "rounded-full"
      : "rounded-none border-2 border-border";

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % prompts.length);
        setVisible(true);
      }, 600);
    }, 6000);
    return () => clearInterval(interval);
  }, [prompts.length]);

  return (
    <article className="chat-message max-w-full overflow-auto streamdown">
      <div className="flex items-center gap-3 mb-3">
        <Image
          src="/feynman.png"
          alt="Mr. Feynman"
          width={36}
          height={36}
          className={`h-9 w-9 object-cover object-top ${logoClass}`}
        />
        <span className="text-lg font-bold text-foreground">Mr. Feynman</span>
      </div>
      <div className="chat-message-content">
        <p>
          Alright, so here&apos;s the deal — I can explain just about anything,
          but you&apos;ve got to tell me what&apos;s on your mind first. Been
          thinking about{" "}
          <strong
            className="transition-opacity duration-600"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {prompts[index]}
          </strong>{" "}
          lately, but honestly, I&apos;m game for whatever.
        </p>
      </div>
    </article>
  );
}

export function ChatPage({ agent, greeting, suggestions }: ChatPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { feynmanRequested, setFeynmanRequested } = usePlan();

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
    branchSuggestion,
    dismissBranchSuggestion,
    phaseComplete,
    dismissPhaseComplete,
  } = useChat({ agent });

  // Open Feynman modal when Pen tab is clicked
  useEffect(() => {
    if (agent !== "feynman") return;
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
  }, [agent, feynmanRequested, setFeynmanRequested, threadId, openFeynman]);

  const chatStarted = messages.length > 0;

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

  const annotationsByMessage = new Map<string, Branch[]>();
  if (branchData?.branches) {
    for (const b of branchData.branches) {
      if (!b.position) continue;
      const existing = annotationsByMessage.get(b.message_id) ?? [];
      existing.push(b);
      annotationsByMessage.set(b.message_id, existing);
    }
  }

  const { branch, isPending: isBranching } = useBranchout({
    onSuccess: (res, vars) => {
      dismissBranchSuggestion();
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
        <div className="flex flex-col overflow-auto px-4 relative z-0 gap-4 min-h-0 pb-6">
          {messages.map((msg, index) => {
            if (msg.type === "plan_card") {
              return (
                <PlanCreatedCard
                  key={msg.id}
                  topicSlug={msg.metadata?.topicSlug ?? ""}
                  onStart={
                    threadId
                      ? async () => {
                          const result = await startPhase(threadId);
                          queryClient.invalidateQueries({
                            queryKey: ["threads"],
                          });
                          queryClient.invalidateQueries({
                            queryKey: ["thread-tree"],
                          });
                          const m = `Let's start learning: ${result.phase_title ?? result.title}`;
                          router.push(
                            `/threads/${result.thread_id}?msg=${encodeURIComponent(m)}`,
                          );
                        }
                      : undefined
                  }
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
                agent={agent}
              />
            );
          })}
          {branchSuggestion && threadId && (
            <BranchSuggestionCard
              topic={branchSuggestion.topic}
              reason={branchSuggestion.reason}
              loading={isBranching}
              onBranch={() => {
                branch({
                  messageId: branchSuggestion.messageId,
                  threadId,
                  branchText: branchSuggestion.topic,
                  title: branchSuggestion.topic,
                });
              }}
              onDismiss={dismissBranchSuggestion}
            />
          )}
          {agent === "feynman" &&
            phaseComplete &&
            !phaseComplete.isFinalPhase &&
            !feynmanOpen &&
            threadId && (
              <PhaseActionButton
                label="Continue to Next Phase"
                sublabel={`You've completed ${phaseComplete.phaseTitle}! Up next: ${phaseComplete.nextPhaseTitle}`}
                onClick={async () => {
                  const result = await createNextPhaseThread(threadId);
                  if (result.error) return;
                  dismissPhaseComplete();
                  queryClient.invalidateQueries({ queryKey: ["threads"] });
                  queryClient.invalidateQueries({ queryKey: ["thread-tree"] });
                  router.push(`/threads/${result.thread_id}`);
                }}
              />
            )}
          {agent === "feynman" &&
            phaseComplete &&
            phaseComplete.isFinalPhase &&
            !feynmanOpen && (
              <PhaseActionButton
                label="View Results"
                sublabel="Congratulations! You've completed all phases of your learning plan."
                onClick={async () => {
                  router.push(`/threads`);
                }}
              />
            )}
        </div>
      ) : (
        <div className="flex flex-col justify-center items-center gap-2">
          {greeting}
          {suggestions && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 px-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm border-2 border-border px-3 py-1.5 text-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
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
      {agent === "feynman" && feynmanOpen && feynmanConcept && threadId && (
        <FeynmanModal
          threadId={threadId}
          conceptName={feynmanConcept}
          onClose={dismissFeynman}
          onSubmitComplete={() => {}}
        />
      )}
    </div>
  );
}
