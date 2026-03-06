"use client";

import { useCallback, useRef, useState } from "react";
import {
  ChevronLeft,
  GitBranchIcon,
  SendHorizonal,
  StopCircle,
} from "lucide-react";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import clsx from "clsx";

interface PromptInputInterface {
  className?: string;
  onSubmit: (content: string) => void;
  streaming?: boolean;
  config?: {
    goBack?: boolean;
    branchout?: boolean;
  };
}
export function PromptInput({
  className,
  config,
  onSubmit,
  streaming = false,
}: PromptInputInterface) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
                <ChevronLeft /> Go Back
              </Button>
            )}
            {config && config?.branchout && (
              <Button variant={"outline"}>
                <GitBranchIcon /> Branch Out
              </Button>
            )}
          </div>
        )}
        <div className="bg-background pb-6">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={3}
            className="field-sizing-fixed max-h-48 w-full resize-none overflow-y-auto pr-20 py-3"
          />
          <Button
            disabled={!value.trim()}
            onClick={handleSubmit}
            className="absolute right-1.5 bottom-8  shrink-0 cursor-pointer"
          >
            {!streaming && <SendHorizonal className="h-4 w-4" />}
            {streaming && <StopCircle />}
          </Button>
        </div>
      </div>
    </>
  );
}
