"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface PlanContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  feynmanRequested: boolean;
  setFeynmanRequested: (v: boolean) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState("chat-mode");
  const [feynmanRequested, setFeynmanRequested] = useState(false);

  return (
    <PlanContext.Provider
      value={{
        activeTab,
        setActiveTab,
        feynmanRequested,
        setFeynmanRequested,
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
