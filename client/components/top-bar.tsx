"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { TabsList, TabsTrigger } from "./ui/tabs";
import {
  ChevronLeft,
  ChevronsLeft,
  ListTodo,
  MessageCircle,
  NetworkIcon,
  Pen,
} from "lucide-react";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { TopicProgress } from "@/components/topic-progress";

interface TopBarInterface {
  config?: {
    back?: boolean;
    title?: string;
  };
  backToRootHandler: () => void;
  backToParentHandler: () => void;
}
export function TopBar({
  config,
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
      className={`flex bg-background z-20 items-center justify-between p-2 sticky top-0 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-6 after:translate-y-full after:bg-gradient-to-b after:from-background after:to-transparent after:pointer-events-none after:transition-opacity ${scrolled ? "after:opacity-100" : "after:opacity-0"}`}
    >
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
        </div>
      </div>

      {/*<div className="absolute left-1/2 -translate-x-1/2">
        <AgentPill />
      </div>*/}

      <div className="flex items-center gap-2">
        <TopicProgress />
        <TabsList>
          <TabsTrigger value="chat-mode">
            <MessageCircle />
          </TabsTrigger>
          <TabsTrigger value="feynman-mode">
            <Pen />
          </TabsTrigger>
          <TabsTrigger value="plan-mode">
            <ListTodo />
          </TabsTrigger>
          <TabsTrigger value="graph-mode">
            <NetworkIcon />
          </TabsTrigger>
        </TabsList>
        <ThemeToggle />
      </div>
    </div>
  );
}
