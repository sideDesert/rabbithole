import clsx from "clsx";
import React, { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { ThinkingOrb } from "./thought-trail";
import { useThemePersonality } from "@/components/theme-personality-provider";
import Image from "next/image";
import type { Branch } from "@/lib/api";
import type { ToolCallEntry } from "@/hooks/use-chat";
import { useAnnotations } from "@/hooks/use-annotations";
import {
  CircleCheck,
  Search,
  Atom,
  FileCheck,
  FileText,
  ListChecks,
  GitBranch,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./ui/collapsible";

export const ROLE_USER = "user";
export const ROLE_AI = "assistant";

interface ChatMessageInterface {
  id: string;
  content: React.ReactNode;
  role: typeof ROLE_USER | typeof ROLE_AI;
  className?: string;
  isLast?: boolean;
  isStreaming?: boolean;
  isLoading?: boolean;
  statusMessage?: string;
  toolCalls?: ToolCallEntry[];
  annotations?: Branch[];
  agent?: string;
}

function lastMessageRef(id: string) {
  return (el: HTMLElement | null) => {
    if (!el) return;

    const parts = id.split("-");
    const index = parseInt(parts[1], 10);
    if (isNaN(index) || index < 1) return;

    const prevMsgId = `msg-${index - 1}`;
    const prevEl = document.querySelector(`[data-message-id="${prevMsgId}"]`);
    if (!prevEl) return;

    const h0 = prevEl.getBoundingClientRect().height;
    el.style.minHeight = `calc(100vh - 220px - ${h0}px)`;
  };
}

export function PhaseDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2 animate-in fade-in duration-300">
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted-foreground tracking-widest uppercase">
        {label}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

const TOOL_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  recall_memory: Search,
  store_memory: Atom,
  create_plan: FileCheck,
  read_plan: FileText,
  update_plan_progress: ListChecks,
  suggest_branches: GitBranch,
  offer_branch: GitBranch,
};

function pickRandom() {
  return loadingWords[Math.floor(Math.random() * loadingWords.length)];
}

function useRotatingWord(active: boolean) {
  const [word, setWord] = useState(pickRandom);
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      setWord(pickRandom());
      const delay = 6000 + Math.random() * 9000;
      timer = window.setTimeout(tick, delay);
    };
    let timer = window.setTimeout(tick, 6000 + Math.random() * 9000);
    return () => clearTimeout(timer);
  }, [active]);
  return word;
}

function ToolCallBlock({ tc }: { tc: ToolCallEntry }) {
  const isDone = tc.status === "done";
  const Icon = TOOL_ICONS[tc.name] ?? CircleCheck;
  const rotatingWord = useRotatingWord(!isDone);

  return (
    <Collapsible disabled={!tc.result}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-start py-1 cursor-pointer">
        {isDone ? (
          <Icon className="w-4 h-4 text-primary/50" />
        ) : (
          <Icon className="w-4 h-4 text-muted-foreground/50 animate-pulse" />
        )}
        <span className="text-left">
          {isDone ? tc.doneLabel : `${rotatingWord}...`}
        </span>
      </CollapsibleTrigger>
      {tc.result && (
        <CollapsibleContent>
          <pre className="text-xs text-muted-foreground bg-muted rounded-md p-2 mt-1 mb-2 overflow-x-auto whitespace-pre-wrap border-2 border-border">
            {(() => {
              try {
                return JSON.stringify(JSON.parse(tc.result!), null, 2);
              } catch {
                return tc.result;
              }
            })()}
          </pre>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

const loadingWords = [
  "Rummaging",
  "Meandering",
  "Floggulating",
  "Tinkering",
  "Fiddling",
  "Pottering",
  "Puttering",
  "Dabbling",
  "Toiling",
  "Laboring",
  "Slogging",
  "Grinding",
  "Churning",
  "Hammering",
  "Cobbling",
  "Hacking",
  "Patching",
  "Crafting",
  "Shaping",
  "Forging",
  "Stirring",
  "Simmering",
  "Whisking",
  "Kneading",
  "Sauteing",
  "Braising",
  "Roasting",
  "Grilling",
  "Searing",
  "Tempering",
  "Concocting",
  "Brewing",
  "Fermenting",
  "Distilling",
  "Stewing",
  "Mixing",
  "Blending",
  "Folding",
  "Marinating",
  "Glazing",
  "Assembling",
  "Engineering",
  "Fabricating",
  "Machining",
  "Welding",
  "Soldering",
  "Riveting",
  "Chiseling",
  "Carving",
  "Sculpting",
  "Iterating",
  "Prototyping",
  "Refining",
  "Optimizing",
  "Debugging",
  "Compiling",
  "Hacking away",
  "Cobbling together",
  "Whipping up",
  "Rustling up",
  "Noodling",
  "Poking around",
  "Digging around",
  "Fussing",
  "Mucking about",
  "Monkeying",
  "Tinkering away",
  "Fussing with",
  "Putzing",
  "Doodling",
  "Experimenting",
  "Scheming",
  "Devising",
  "Rigging",
  "Jury rigging",
  "Kludging",
  "MacGyvering",
  "Hammering away",
  "Plugging away",
  "Chipping away",
  "Slogging through",
  "Grinding away",
  "Sweating over",
  "Sweating through",
  "Whipping together",
  "Hacking together",
  "Slapping together",
  "Conjuring",
  "Brewing up",
  "Cooking up",
  "Spinning up",
  "Cranking out",
  "Hammering out",
  "Banging out",
  "Churning out",
  "Rolling up sleeves",
  "Whipping out",
];

export function ChatMessage({
  id,
  content,
  role,
  className,
  isLast,
  isStreaming,
  isLoading,
  statusMessage,
  toolCalls,
  annotations,
  agent = "feynman",
}: ChatMessageInterface) {
  const { activeTheme } = useThemePersonality();
  const logoClass = activeTheme.id === "classic" ? "rounded-full" : "rounded-none border-2 border-border";
  const agentLabel = agent === "ebbinghaus" ? "Ms. Ebbinghaus" : "Mr. Feynman";
  const agentLogo = agent === "ebbinghaus" ? "/ebbinghaus.png" : "/feynman.png";
  const articleRef = useRef<HTMLElement | null>(null);
  useAnnotations(
    articleRef,
    role === ROLE_AI ? annotations : undefined,
    !!isStreaming,
  );

  if (role === ROLE_USER) {
    return (
      <div
        className={clsx(
          "chat-message bg-accent dark:bg-accent/70 dark:hover:bg-accent text-accent-foreground dark:font-medium py-3 px-3 rounded-lg max-w-[85%] border-2 border-border shadow-sm",
          className,
        )}
        data-message-id={id}
      >
        {content}
      </div>
    );
  }
  if (role === ROLE_AI) {
    const hasToolCalls = toolCalls && toolCalls.length > 0;

    return (
      <article
        className="chat-message max-w-full overflow-auto streamdown"
        data-message-id={id}
        ref={(el) => {
          articleRef.current = el;
          if (!el) return;
          if (isLast) {
            lastMessageRef(id)(el);
          } else {
            el.style.minHeight = "";
          }
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <Image src={agentLogo} alt={agentLabel} width={36} height={36} className={`h-9 w-9 object-cover object-top ${logoClass}`} />
          <span className="text-lg font-bold text-foreground">{agentLabel}</span>
        </div>
        {isLoading && (
          <ThinkingOrb />
        )}
        {hasToolCalls && (
          <div className="mb-3 space-y-0.5">
            {toolCalls!.map((tc, i) => (
              <ToolCallBlock key={`${tc.name}-${i}`} tc={tc} />
            ))}
          </div>
        )}
        <div className="chat-message-content">
          <Streamdown>{content as string}</Streamdown>
        </div>
      </article>
    );
  }

  return null;
}
