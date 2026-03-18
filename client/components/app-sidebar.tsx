"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeIcon } from "@/components/theme-icon";
import type { IconName } from "@/lib/icon-map";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useAgent, type AgentId } from "@/components/agent-context";
import { usePlan } from "@/components/plan-context";
import { useThemePersonality } from "@/components/theme-personality-provider";
import { ThreadTree } from "@/components/thread-tree";
import { ThemePersonalitySwitcher } from "@/components/theme-personality-switcher";
import Image from "next/image";
import { Rabbit } from "lucide-react";

export type Tool = {
  name: string;
  iconName: IconName;
  href: string;
};

export function AppSidebar({ tools }: { tools: Tool[] }) {
  const path = usePathname();
  const router = useRouter();

  const { activeAgent, setActiveAgent } = useAgent();
  const { setThreadId } = usePlan();
  const { activeTheme } = useThemePersonality();
  const logoClass = activeTheme.id === "classic" ? "rounded-full" : "rounded-none border-2 border-border";

  function handleAgentNav(agentId: AgentId) {
    setThreadId(null);
    setActiveAgent(agentId);
    router.push(agentId === "ebbinghaus" ? "/ebbinghaus" : "/feynman");
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Rabbit className="h-6 w-6" />
          <span className="text-lg font-semibold">rabbithole</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex flex-col overflow-hidden border-r-2 border-border">
        {/* Agent Personas */}
        <SidebarGroup>
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={
                  activeAgent === "feynman" &&
                  (path.includes("feynman") || path.includes("threads"))
                }
                onClick={() => handleAgentNav("feynman")}
              >
                <Image src="/feynman.png" alt="Feynman" width={28} height={28} className={`h-7 w-7 object-cover object-top ${logoClass}`} />
                <span>Feynman</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeAgent === "ebbinghaus"}
                onClick={() => handleAgentNav("ebbinghaus")}
              >
                <Image src="/ebbinghaus.png" alt="Ebbinghaus" width={28} height={28} className={`h-7 w-7 object-cover object-top ${logoClass}`} />
                <span>Ebbinghaus</span>
              </SidebarMenuButton>
              <SidebarMenuBadge>3</SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Tools Section */}
        <SidebarGroup>
          <p className="px-2 pb-1 text-sm font-semibold text-sidebar-foreground/90">
            Tools
          </p>
          <SidebarMenu className="flex flex-col gap-1">
            {tools.map((tool) => (
              <SidebarMenuItem key={tool.name}>
                <SidebarMenuButton
                  isActive={path.includes(tool.href)}
                  render={tool.href ? <Link href={tool.href} /> : undefined}
                >
                  <ThemeIcon name={tool.iconName} className="h-4 w-4" />
                  <span>{tool.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* Thread Tree */}
        <SidebarGroup className="flex-1 overflow-auto border-t-2 border-border">
          <p className="px-2 pb-1 text-sm font-semibold text-sidebar-foreground/90">
            {activeAgent === "ebbinghaus" ? "Conversations" : "Topics"}
          </p>
          <ThreadTree agent={activeAgent} />
        </SidebarGroup>

        <SidebarGroup className="border-t-2 border-border p-2">
          <ThemePersonalitySwitcher />
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
