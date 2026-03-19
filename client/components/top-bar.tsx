"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { TabsList, TabsTrigger } from "./ui/tabs";
import {
  ChevronLeft,
  ChevronsLeft,
  ListChecks,
  MessageCircle,
  Network,
  Pencil,
} from "lucide-react";
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
  return (
    <div className="noise-surface flex bg-background border-b-2 border-border z-20 items-center justify-between p-2 sticky top-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <div className="flex flex-row items-center gap-4">
          {config?.back && (
            <ButtonGroup>
              <Button variant="outline" onClick={backToRootHandler}>
                <ChevronsLeft /> Root
              </Button>
              <Button variant="outline" onClick={backToParentHandler}>
                <ChevronLeft /> Parent
              </Button>
            </ButtonGroup>
          )}
          {config?.title && <h2 className="font-medium">{config.title}</h2>}
          {threadDepth != null && threadDepth > 0 && threadStatus && (
            <Badge
              variant="secondary"
              className="gap-1  px-1.5 py-0 border-2 border-border bg-card text-foreground"
            >
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  threadStatus === "active" && "bg-emerald-500",
                  threadStatus === "explored" && "bg-muted-foreground",
                  threadStatus === "mastered" && "bg-amber-500",
                )}
              />
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
              <MessageCircle />
            </TabsTrigger>
            <TabsTrigger value="feynman-mode">
              <Pencil />
            </TabsTrigger>
            <TabsTrigger value="plan-mode">
              <ListChecks />
            </TabsTrigger>
            <TabsTrigger value="graph-mode">
              <Network />
            </TabsTrigger>
          </TabsList>
        )}
        <ThemeToggle />
      </div>
    </div>
  );
}
