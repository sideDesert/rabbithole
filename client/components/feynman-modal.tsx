"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Block } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";

import { Button } from "@/components/ui/button";
import { HintBanner } from "@/components/hint-banner";
import { requestFeynmanHint, submitFeynmanExplanation } from "@/lib/api";
import { X } from "lucide-react";

interface FeynmanModalProps {
  threadId: string;
  conceptName: string;
  onClose: () => void;
}

const DRAFT_KEY = (threadId: string, concept: string) =>
  `feynman-draft:${threadId}:${concept}`;

export function FeynmanModal({
  threadId,
  conceptName,
  onClose,
}: FeynmanModalProps) {
  const [hints, setHints] = useState<{ id: string; text: string }[]>([]);
  const [hintIds, setHintIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const hasContentRef = useRef(false);

  const editor = useCreateBlockNote({
    domAttributes: {
      editor: {
        class: "feynman-editor",
      },
    },
  });

  // Restore draft from localStorage on mount
  useEffect(() => {
    const key = DRAFT_KEY(threadId, conceptName);
    const draft = localStorage.getItem(key);
    if (draft) {
      try {
        const blocks = JSON.parse(draft) as Block[];
        if (blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch {
        // ignore corrupt drafts
      }
    }
  }, [editor, threadId, conceptName]);

  // Save draft to localStorage periodically
  useEffect(() => {
    const key = DRAFT_KEY(threadId, conceptName);
    const interval = setInterval(() => {
      const blocks = editor.document;
      const hasText = blocks.some(
        (b) =>
          b.content &&
          Array.isArray(b.content) &&
          b.content.some((c: any) => c.type === "text" && c.text.trim()),
      );
      hasContentRef.current = hasText;
      if (hasText) {
        localStorage.setItem(key, JSON.stringify(blocks));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [editor, threadId, conceptName]);

  const handleHintRef = useRef<(() => void) | null>(null);

  const handleHint = useCallback(async () => {
    if (isHintLoading) return;
    setIsHintLoading(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      const res = await requestFeynmanHint(threadId, conceptName, markdown);
      setHints((prev) => [...prev, { id: res.hint_id, text: res.hint }]);
      setHintIds((prev) => [...prev, res.hint_id]);
    } catch {
      // silently fail — hint is optional
    } finally {
      setIsHintLoading(false);
    }
  }, [editor, threadId, conceptName, isHintLoading]);

  handleHintRef.current = handleHint;

  const getCustomSlashMenuItems = useCallback(
    (ed: typeof editor) => [
      ...getDefaultReactSlashMenuItems(ed),
      {
        title: "Hint",
        subtext: "Get a nudge about what to cover next",
        group: "Other",
        icon: <span>💡</span>,
        onItemClick: () => {
          handleHintRef.current?.();
        },
      },
    ],
    [],
  );

  const handleDismissHint = useCallback((id: string) => {
    setHints((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      await submitFeynmanExplanation(threadId, conceptName, markdown, hintIds);
      localStorage.removeItem(DRAFT_KEY(threadId, conceptName));
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  }, [editor, threadId, conceptName, hintIds, onClose]);

  const handleClose = useCallback(() => {
    if (hasContentRef.current) {
      if (!window.confirm("Discard your explanation?")) return;
    }
    onClose();
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Feynman Mode
          </p>
          <h1 className="mt-1 text-xl font-semibold">
            Explain: {conceptName}
          </h1>
        </div>
        <button
          onClick={handleClose}
          className="rounded-lg p-2 hover:bg-accent"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Hints */}
      <HintBanner hints={hints} onDismiss={handleDismissHint} />

      {/* Editor */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <BlockNoteView
            editor={editor}
            theme="light"
            data-feynman-editor
          >
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) =>
                filterSuggestionItems(
                  getCustomSlashMenuItems(editor),
                  query,
                )
              }
            />
          </BlockNoteView>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleHint}
          disabled={isHintLoading}
        >
          {isHintLoading ? "Getting hint..." : "Hint"}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Submitting..." : "Submit Explanation"}
        </Button>
      </div>
    </div>
  );
}
