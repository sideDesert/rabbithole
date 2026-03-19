"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type Block } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { HintBanner } from "@/components/hint-banner";
import {
  requestFeynmanHint,
  submitFeynmanExplanation,
} from "@/lib/api";
import { CircleX } from "lucide-react";

interface FeynmanModalProps {
  threadId: string;
  conceptName: string;
  onClose: () => void;
  onSubmitComplete?: (submissionId: string) => void;
  dismissable?: boolean;
}

const DRAFT_KEY = (threadId: string, concept: string) =>
  `feynman-draft:${threadId}:${concept}`;

export function FeynmanModal({
  threadId,
  conceptName,
  onClose,
  onSubmitComplete,
  dismissable = true,
}: FeynmanModalProps) {
  const [hints, setHints] = useState<{ id: string; text: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const hasContentRef = useRef(false);
  const { resolvedTheme } = useTheme();

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

  const animateOut = useCallback((cb: () => void) => {
    setVisible(false);
    setTimeout(cb, 200);
  }, []);

  const handleClose = useCallback(() => {
    if (!dismissable) return;
    if (hasContentRef.current) {
      if (!window.confirm("Discard your explanation?")) return;
    }
    animateOut(onClose);
  }, [dismissable, onClose, animateOut]);

  // Animate in
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Lock scroll while modal is open
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  const handleHintRef = useRef<(() => void) | null>(null);

  const handleHint = useCallback(async () => {
    if (isHintLoading) return;
    setIsHintLoading(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      const res = await requestFeynmanHint(threadId, conceptName, markdown);
      setHints((prev) => [...prev, { id: res.hint_id, text: res.hint }]);
    } catch {
      // silently fail — hint is optional
    } finally {
      setIsHintLoading(false);
    }
  }, [editor, threadId, conceptName, isHintLoading]);

  handleHintRef.current = handleHint;

  const handleDismissHint = useCallback((id: string) => {
    setHints((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      const hintIds = hints.map((h) => h.id);
      const { submission_id } = await submitFeynmanExplanation(
        threadId,
        conceptName,
        markdown,
        hintIds,
      );
      localStorage.removeItem(DRAFT_KEY(threadId, conceptName));
      toast.info(`Evaluation started for ${conceptName}`);
      onSubmitComplete?.(submission_id);
      animateOut(onClose);
    } catch {
      toast.error("Failed to submit explanation");
      setIsSubmitting(false);
    }
  }, [editor, threadId, conceptName, hints, onClose, animateOut, onSubmitComplete]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-99 bg-background/80 transition-opacity duration-300 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={dismissable ? handleClose : undefined}
      />
      {/* Modal */}
      <div
        className={`fixed inset-4 z-100 max-w-4xl mx-auto flex flex-col rounded-lg border-2 border-border bg-background shadow-lg transition-all duration-300 ease-out ${visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-border px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Feynman Mode
            </p>
            <h1 className="mt-1 text-xl font-semibold">
              Explain: {conceptName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Explain this concept in your own words as if teaching it to someone new. The clearer your explanation, the better you understand it.
            </p>
          </div>
          {dismissable && (
            <button
              onClick={handleClose}
              className="rounded-lg p-2 hover:bg-accent"
            >
              <CircleX className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Hints */}
        <HintBanner hints={hints} onDismiss={handleDismissHint} />

        {/* Editor */}
        <div className="flex-1 min-h-0 px-6 py-4 overflow-auto">
          <BlockNoteView
            className="bg-transparent"
            editor={editor}
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            data-feynman-editor
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-border px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleHint}
            disabled={isHintLoading}
          >
            {isHintLoading ? "Getting hint..." : "Hint"}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Explanation"}
          </Button>
        </div>
      </div>
    </>
  );
}
