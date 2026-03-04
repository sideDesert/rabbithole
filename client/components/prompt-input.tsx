"use client";

import { useCallback, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import clsx from "clsx";

interface PromptInputInterface {
  className?: string;
}
export function PromptInput({ className }: PromptInputInterface) {
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

  return (
    <div className={clsx("relative w-full", className)}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder="Type your message..."
        rows={3}
        className="field-sizing-fixed max-h-48 w-full resize-none overflow-y-auto pr-20 py-3"
      />
      <Button
        disabled={!value.trim()}
        className="absolute right-1.5 bottom-1.5 shrink-0 cursor-pointer"
      >
        <SendHorizonal className="h-4 w-4" />
      </Button>
    </div>
  );
}
