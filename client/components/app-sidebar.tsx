"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Rabbit,
  MessageSquare,
  Network,
  BrainCircuit,
  LayoutDashboard,
  SquarePen,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useAgent } from "@/components/agent-context";
import { usePlan } from "@/components/plan-context";
import { ThreadTree } from "@/components/thread-tree";

const tools = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { name: "Chat Threads", icon: MessageSquare, href: "/threads" },
  { name: "Knowledge Graph", icon: Network, href: "/knowledge-graph" },
  { name: "Memories", icon: BrainCircuit, href: "/memories" },
] as const;

export function AppSidebar() {
  const path = usePathname();
  const router = useRouter();

  const { activeAgent, setActiveAgent } = useAgent();
  const { setThreadId } = usePlan();

  function handleAgentNav(agentId: string, path: string) {
    if (agentId === "feynman") setThreadId(null);
    setActiveAgent(agentId);
    router.push(path);
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Rabbit className="h-6 w-6" />
          <span className="text-lg font-semibold">rabbithole</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex flex-col overflow-hidden">
        {/* Agent Personas */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeAgent === "feynman" || path.includes("feynman")}
                onClick={() => handleAgentNav("feynman", "/feynman")}
              >
                <SquarePen className="h-4 w-4" />
                <span>New Chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeAgent === "ebbinghaus" || path.includes("ebbinghaus")}
                onClick={() => handleAgentNav("ebbinghaus", "/ebbinghaus")}
              >
                <BrainCircuit className="h-4 w-4" />
                <span>Ebbinghaus</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

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
                  <tool.icon className="h-4 w-4" />
                  <span>{tool.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Thread Tree */}
        <SidebarGroup className="flex-1 overflow-auto">
          <p className="px-2 pb-1 text-sm font-semibold text-sidebar-foreground/90">
            History
          </p>
          <ThreadTree />
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
