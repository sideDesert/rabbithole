"use client";

import { useParams } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

interface PlanContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  threadId: string | null;
  setThreadId: (id: string | null) => void;
  topicSlug: string | null;
  setTopicSlug: (slug: string | null) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState("chat-mode");
  const params = useParams();
  const [threadId, setThreadId] = useState<string | null>(
    (params?.threadId as string) ?? null,
  );
  const [topicSlug, setTopicSlug] = useState<string | null>(null);

  return (
    <PlanContext.Provider
      value={{
        activeTab,
        setActiveTab,
        threadId,
        setThreadId,
        topicSlug,
        setTopicSlug,
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
