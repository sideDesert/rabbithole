"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreviewPanelProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function PreviewPanel({ open, onClose, children }: PreviewPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-4 right-4 w-80 max-h-[calc(100%-2rem)] overflow-auto bg-card border-2 border-border rounded-lg shadow-md z-10 animate-in slide-in-from-right-4 fade-in duration-200"
    >
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-medium">Details</span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <CircleX size={14} />
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
