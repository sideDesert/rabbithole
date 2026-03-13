"use client";

import { useCallback, useEffect, useState } from "react";

export interface SelectionState {
  selectedText: string;
  messageId: string;
  menuPosition: { x: number; y: number };
  textPosition: [number, number] | null;
  isVisible: boolean;
}

const initialState: SelectionState = {
  selectedText: "",
  messageId: "",
  menuPosition: { x: 0, y: 0 },
  textPosition: null,
  isVisible: false,
};

export function useTextSelectionMenu() {
  const [state, setState] = useState<SelectionState>(initialState);

  const hide = useCallback(() => {
    setState(initialState);
  }, []);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hide();
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 2) {
      hide();
      return;
    }

    // Check that selection is within a single chat message
    const anchorContainer = selection.anchorNode?.parentElement?.closest(
      ".chat-message",
    );
    const focusContainer = selection.focusNode?.parentElement?.closest(
      ".chat-message",
    );

    if (!anchorContainer || !focusContainer) {
      hide();
      return;
    }

    // Disable menu if selection spans multiple messages
    if (anchorContainer !== focusContainer) {
      hide();
      return;
    }

    const messageId = anchorContainer.getAttribute("data-message-id");
    if (!messageId) {
      hide();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    let textPosition: [number, number] | null = null;
    try {
      const preRange = document.createRange();
      preRange.selectNodeContents(anchorContainer);
      preRange.setEnd(range.startContainer, range.startOffset);
      const start = preRange.toString().length;
      textPosition = [start, start + text.length];
    } catch {
      textPosition = null;
    }

    setState({
      selectedText: text,
      messageId,
      menuPosition: {
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      },
      textPosition,
      isVisible: true,
    });
  }, [hide]);

  useEffect(() => {
    const onMouseUp = () => {
      // Small delay to let selection finalize
      requestAnimationFrame(handleSelectionChange);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hide();
        window.getSelection()?.removeAllRanges();
        return;
      }
      handleSelectionChange();
    };

    const onScroll = () => {
      if (state.isVisible) {
        hide();
      }
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [handleSelectionChange, hide, state.isVisible]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    hide();
  }, [hide]);

  return { ...state, clearSelection };
}
