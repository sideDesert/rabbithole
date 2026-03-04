"use client";

import { Quote, GitBranch } from "lucide-react";

interface TextSelectionMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  selectedText: string;
  messageId: string;
  onQuote: (data: { messageId: string; text: string }) => void;
  onBranch: (data: { messageId: string; text: string }) => void;
  onActionComplete: () => void;
}

export function TextSelectionMenu({
  visible,
  position,
  selectedText,
  messageId,
  onQuote,
  onBranch,
  onActionComplete,
}: TextSelectionMenuProps) {
  if (!visible) return null;

  const handleQuote = () => {
    onQuote({ messageId, text: selectedText });
    onActionComplete();
  };

  const handleBranch = () => {
    onBranch({ messageId, text: selectedText });
    onActionComplete();
  };

  return (
    <div
      className="fixed z-[100] flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-1 shadow-lg"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -100%)",
      }}
    >
      <button
        onClick={handleQuote}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent transition-colors cursor-pointer"
      >
        <Quote className="h-3.5 w-3.5" />
        Quote
      </button>
      <div className="h-4 w-px bg-border" />
      <button
        onClick={handleBranch}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent transition-colors cursor-pointer"
      >
        <GitBranch className="h-3.5 w-3.5" />
        Branch Out
      </button>
    </div>
  );
}
