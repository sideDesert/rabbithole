"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { TabsList, TabsTrigger } from "./ui/tabs";
import {
  ChevronLeft,
  ListTodo,
  MessageCircle,
  NetworkIcon,
  Pen,
} from "lucide-react";
import { Button } from "./ui/button";

interface TopBarInterface {
  config?: {
    back?: boolean;
    title?: string;
  };
}
export function TopBar({ config }: TopBarInterface) {
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
      <SidebarTrigger />
      <div className="flex w-full justify-between px-2">
        <div className="flex flex-row justify-center items-center gap-4">
          {config && config?.back && (
            <Button variant="outline">
              <ChevronLeft /> Back to Root
            </Button>
          )}
          {config && config?.title && (
            <h2 className="font-medium">{config.title}</h2>
          )}
        </div>
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
      </div>
      <ThemeToggle />
    </div>
  );
}
