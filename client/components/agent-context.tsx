"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type AgentId = "ebbinghaus" | "feynman";

interface Agent {
  id: AgentId;
  name: string;
  image: string;
  href: string;
}

interface AgentContextValue {
  activeAgent: AgentId;
  setActiveAgent: (agent: AgentId) => void;
  agents: Agent[];
}

const agents: Agent[] = [
  {
    id: "feynman",
    name: "Feynman",
    image: "/agents/feynman.svg",
    href: "/feynman",
  },
  {
    id: "ebbinghaus",
    name: "Ebbinghaus",
    image: "/agents/ebbinghaus.svg",
    href: "/ebbinghaus",
  },
];

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [activeAgent, setActiveAgent] = useState<AgentId>("feynman");

  return (
    <AgentContext.Provider value={{ activeAgent, setActiveAgent, agents }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within AgentProvider");
  return ctx;
}
