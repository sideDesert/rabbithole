"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useAgent } from "@/components/agent-context";

export function AgentPill() {
  const { activeAgent, setActiveAgent, agents } = useAgent();

  return (
    <div className="inline-flex items-center rounded-md border-2 border-border bg-muted p-[3px]">
      {agents.map((agent) => {
        const isActive = activeAgent === agent.id;
        return (
          <button
            key={agent.id}
            onClick={() => setActiveAgent(agent.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-all",
              isActive
                ? "bg-background text-foreground border-2 border-border shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Image
              src={agent.image}
              alt={agent.name}
              width={16}
              height={16}
              className="rounded-full"
            />
            <span>{agent.name}</span>
          </button>
        );
      })}
    </div>
  );
}
