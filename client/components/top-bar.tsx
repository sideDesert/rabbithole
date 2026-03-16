"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { TabsList, TabsTrigger } from "./ui/tabs";
import {
  AltArrowLeftBoldDuotone,
  DoubleAltArrowLeftBoldDuotone,
  ChecklistBoldDuotone,
  ChatRoundBoldDuotone,
  GraphBoldDuotone,
  Pen2BoldDuotone,
} from "solar-icon-set";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { Badge } from "@/components/ui/badge";
import { TopicProgress } from "@/components/topic-progress";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface TopBarInterface {
  config?: {
    back?: boolean;
    title?: string;
    progress?: boolean;
    tabs?: boolean;
  };
  threadStatus?: string;
  threadDepth?: number;
  backToRootHandler: () => void;
  backToParentHandler: () => void;
}
export function TopBar({
  config,
  threadStatus,
  threadDepth,
  backToRootHandler,
  backToParentHandler,
}: TopBarInterface) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`flex bg-background border-b-2 border-border z-20 items-center justify-between p-2 sticky top-0 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-6 after:translate-y-full after:bg-gradient-to-b after:from-background after:to-transparent after:pointer-events-none after:transition-opacity ${scrolled ? "after:opacity-100" : "after:opacity-0"}`}
    >
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <div className="flex flex-row items-center gap-4">
          {config?.back && (
            <ButtonGroup>
              <Button variant="outline" onClick={backToRootHandler}>
                <DoubleAltArrowLeftBoldDuotone /> Root
              </Button>
              <Button variant="outline" onClick={backToParentHandler}>
                <AltArrowLeftBoldDuotone /> Parent
              </Button>
            </ButtonGroup>
          )}
          {config?.title && <h2 className="font-medium">{config.title}</h2>}
          {threadDepth != null && threadDepth > 0 && threadStatus && (
            <Badge
              variant="secondary"
              className={cn(
                "gap-1 text-[10px] px-1.5 py-0 border-2 border-border",
                threadStatus === "active" && "bg-accent text-emerald-600 dark:text-emerald-400",
                threadStatus === "explored" && "bg-muted text-muted-foreground",
                threadStatus === "mastered" && "bg-secondary text-amber-600 dark:text-amber-400",
              )}
            >
              <span className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                threadStatus === "active" && "bg-emerald-500",
                threadStatus === "explored" && "bg-muted-foreground/50",
                threadStatus === "mastered" && "bg-amber-500",
              )} />
              {threadStatus}
            </Badge>
          )}
        </div>
      </div>

      {/*<div className="absolute left-1/2 -translate-x-1/2">
        <AgentPill />
      </div>*/}

      <div className="flex items-center gap-2">
        {config?.progress && <TopicProgress />}
        {config?.tabs && (
          <TabsList>
            <TabsTrigger value="chat-mode">
              <ChatRoundBoldDuotone />
            </TabsTrigger>
            <TabsTrigger value="feynman-mode">
              <Pen2BoldDuotone />
            </TabsTrigger>
            <TabsTrigger value="plan-mode">
              <ChecklistBoldDuotone />
            </TabsTrigger>
            <TabsTrigger value="graph-mode">
              <GraphBoldDuotone />
            </TabsTrigger>
          </TabsList>
        )}
        <ThemeToggle />
      </div>
    </div>
  );
}
