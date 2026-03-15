"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface PhaseActionButtonProps {
  label: string;
  sublabel?: string;
  onClick: () => Promise<void> | void;
}

export function PhaseActionButton({ label, sublabel, onClick }: PhaseActionButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 py-6">
      {sublabel && (
        <p className="text-sm text-muted-foreground">{sublabel}</p>
      )}
      <Button
        size="lg"
        onClick={handleClick}
        disabled={loading}
        className="px-8"
      >
        {loading ? "Loading..." : label}
      </Button>
    </div>
  );
}
