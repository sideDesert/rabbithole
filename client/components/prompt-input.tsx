"use client";

import { useCallback, useRef, useState, type RefCallback } from "react";
import {
  AltArrowLeftBoldDuotone,
  SquareAltArrowUpBold,
  BranchingPathsDownBoldDuotone,
  RefreshBoldDuotone,
  StopCircleBoldDuotone,
  ChatSquareBoldDuotone,
  CloseCircleBoldDuotone,
} from "solar-icon-set";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import clsx from "clsx";
import { Input } from "./ui/input";
import type { InterviewQuestion } from "@/lib/api";

export const MODE_INTERVIEW = "interview";
export const MODE_DEFAULT = "defatul";
export const MODE_TAGGED = "tagged";
export const MODE_BRANCH = "branch";
export type Mode =
  | typeof MODE_INTERVIEW
  | typeof MODE_DEFAULT
  | typeof MODE_TAGGED
  | typeof MODE_BRANCH;

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

interface PromptInputInterface {
  className?: string;
  onSubmit: (content: string) => void;
  onClose: () => void;
  streaming?: boolean;
  loading?: boolean;
  mode?: Mode;
  interviewQuestion?: InterviewQuestion | null;
  tagged?: string;
  config?: {
    goBack?: boolean;
    branchout?: boolean;
  };
  ref?: React.Ref<HTMLElement | null>;
}
export function PromptInput({
  className,
  config,
  onSubmit,
  onClose,
  streaming = false,
  loading = false,
  mode = MODE_DEFAULT,
  tagged = "",
  interviewQuestion = null,
  ref,
}: PromptInputInterface) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const textareaCallbackRef: RefCallback<HTMLTextAreaElement> = (el) => {
    textareaRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref)
      (ref as React.MutableRefObject<HTMLElement | null>).current = el;
  };

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    autoResize();
  };

  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit?.(value.trim());
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <div className={clsx("relative w-full min-w-3xl", className)}>
        {config && (
          <div className="flex py-2 items-end justify-between">
            {config && config?.goBack && (
              <Button variant={"outline"}>
                <AltArrowLeftBoldDuotone /> Go Back
              </Button>
            )}
            {config && config?.branchout && (
              <Button variant={"outline"}>
                <BranchingPathsDownBoldDuotone /> Branch Out
              </Button>
            )}
          </div>
        )}
        <div className="bg-background pb-6 rounded-lg overflow-hidden">
          {mode === MODE_INTERVIEW && interviewQuestion && (
            <div className="flex flex-col gap-2">
              {interviewQuestion.options.map((option, i) => (
                <Button
                  key={i}
                  variant={"outline"}
                  className={"w-full inline-flex justify-start"}
                  onClick={() => onSubmit(option)}
                >
                  <span>{OPTION_LABELS[i] ?? i + 1}</span> <span>{option}</span>
                </Button>
              ))}
              <Input
                ref={ref as React.Ref<HTMLInputElement>}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && value.trim()) {
                    onSubmit(value.trim());
                    setValue("");
                  }
                }}
                placeholder="Or type your own answer..."
                className="field-sizing-fixed max-h-48 w-full resize-none overflow-y-auto pr-20 py-3"
              />
            </div>
          )}
          {(mode === MODE_DEFAULT ||
            mode === MODE_TAGGED ||
            mode === MODE_BRANCH) && (
            <>
              {(mode === MODE_TAGGED || mode === MODE_BRANCH) && (
                <div className="text-md flex w-full justify-between p-2 border-2 text-foreground/60 rounded-xl relative z-0 mb-2">
                  <div className="flex justify-center items-center pl-2">
                    {mode === MODE_TAGGED && (
                      <ChatSquareBoldDuotone size={18} />
                    )}
                    {mode === MODE_BRANCH && (
                      <BranchingPathsDownBoldDuotone size={18} />
                    )}
                  </div>
                  <div className="grow pl-2 text-left inline-flex items-center">
                    {tagged.length > 80 ? `${tagged.slice(0, 80)}...` : tagged}
                  </div>
                  <div>
                    <Button onClick={onClose} variant={"ghost"}>
                      <CloseCircleBoldDuotone />
                    </Button>
                  </div>
                </div>
              )}{" "}
              <Button
                variant={"secondary"}
                disabled={!value.trim() || loading}
                onClick={handleSubmit}
                className="absolute right-1.5 bottom-8 shrink-0 cursor-pointer z-20"
              >
                {loading && (
                  <div className="flex gap-2 justify-center items-center">
                    <RefreshBoldDuotone className="h-4 w-4 animate-spin" />{" "}
                    <div>Creating Branch...</div>
                  </div>
                )}
                {!loading && !streaming && <span>Send</span>}
                {!loading && streaming && <StopCircleBoldDuotone />}
              </Button>
              <Textarea
                ref={textareaCallbackRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                disabled={loading}
                rows={3}
                className="field-sizing-fixed max-h-48 w-full relative resize-none overflow-y-auto pr-20 py-3"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
