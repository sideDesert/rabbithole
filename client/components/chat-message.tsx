import clsx from "clsx";
import React, { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { ThinkingOrb } from "./thought-trail";
import type { Branch } from "@/lib/api";
import type { ToolCallEntry } from "@/hooks/use-chat";
import { useAnnotations } from "@/hooks/use-annotations";
import {
  Check,
  Search,
  Brain,
  FilePlus,
  FileText,
  ListChecks,
  GitBranch,
  type LucideIcon,
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

const TOOL_ICONS: Record<string, LucideIcon> = {
  recall_memory: Search,
  store_memory: Brain,
  create_plan: FilePlus,
  read_plan: FileText,
  update_plan_progress: ListChecks,
  suggest_branches: GitBranch,
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
  const Icon = TOOL_ICONS[tc.name] ?? Check;
  const rotatingWord = useRotatingWord(!isDone);

  return (
    <Collapsible disabled={!tc.result}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-start py-1 cursor-pointer">
        {isDone ? (
          <Icon className="w-3 h-3 text-emerald-400/50" />
        ) : (
          <Icon className="w-3 h-3 text-muted-foreground/50 animate-pulse" />
        )}
        <span className="text-left">{isDone ? tc.label : `${rotatingWord}...`}</span>
      </CollapsibleTrigger>
      {tc.result && (
        <CollapsibleContent>
          <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1 mb-2 overflow-x-auto whitespace-pre-wrap">
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
  "rummaging",
  "meandering",
  "floggulating",
  "tinkering",
  "fiddling",
  "pottering",
  "puttering",
  "dabbling",
  "toiling",
  "laboring",
  "slogging",
  "grinding",
  "churning",
  "hammering",
  "cobbling",
  "hacking",
  "patching",
  "crafting",
  "shaping",
  "forging",
  "stirring",
  "simmering",
  "whisking",
  "kneading",
  "sauteing",
  "braising",
  "roasting",
  "grilling",
  "searing",
  "tempering",
  "concocting",
  "brewing",
  "fermenting",
  "distilling",
  "stewing",
  "mixing",
  "blending",
  "folding",
  "marinating",
  "glazing",
  "assembling",
  "engineering",
  "fabricating",
  "machining",
  "welding",
  "soldering",
  "riveting",
  "chiseling",
  "carving",
  "sculpting",
  "iterating",
  "prototyping",
  "refining",
  "optimizing",
  "debugging",
  "compiling",
  "hackingAway",
  "cobblingTogether",
  "whippingUp",
  "rustlingUp",
  "noodling",
  "pokingAround",
  "diggingAround",
  "fussing",
  "muckingAbout",
  "monkeying",
  "tinkeringAway",
  "fussingWith",
  "putzing",
  "doodling",
  "experimenting",
  "scheming",
  "devising",
  "rigging",
  "juryRigging",
  "kludging",
  "macgyvering",
  "hammeringAway",
  "pluggingAway",
  "chippingAway",
  "sloggingThrough",
  "grindingAway",
  "sweatingOver",
  "sweatingThrough",
  "whippingTogether",
  "hackingTogether",
  "slappingTogether",
  "conjuring",
  "brewingUp",
  "cookingUp",
  "spinningUp",
  "crankingOut",
  "hammeringOut",
  "bangingOut",
  "churningOut",
  "rollingUpSleeves",
  "whippingOut",
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
}: ChatMessageInterface) {
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
          "chat-message bg-accent py-3 px-3 rounded-xl max-w-[85%]",
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
        {isLoading && (
          <ThinkingOrb statusMessage={statusMessage ?? "Loading"} />
        )}
        {hasToolCalls && (
          <div className="mb-3 space-y-0.5">
            {toolCalls!.map((tc, i) => (
              <ToolCallBlock key={`${tc.name}-${i}`} tc={tc} />
            ))}
          </div>
        )}
        <Streamdown>{content as string}</Streamdown>
      </article>
    );
  }

  return null;
}
