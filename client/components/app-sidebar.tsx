"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Rabbit,
  MessageSquare,
  Network,
  BrainCircuit,
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
import { useThreads } from "@/hooks/use-threads";

const tools = [
  { name: "Chat Threads", icon: MessageSquare, href: "/threads" },
  { name: "Knowledge Graph", icon: Network, href: "/knowledge-graph" },
  { name: "Memories", icon: BrainCircuit, href: "memories" },
] as const;

export function AppSidebar() {
  const path = usePathname();
  const router = useRouter();

  const { activeAgent, agents } = useAgent();
  const { setThreadId } = usePlan();
  const { threads: threadsData } = useThreads();

  const activeAgentData = agents.find((a) => a.id === activeAgent);

  const allThreads = threadsData?.threads ?? [];
  const agentThreads = allThreads.filter((t) => t.agent === activeAgent);

  function handleNewChat() {
    setThreadId(null);
    router.push(activeAgentData?.href ?? "/feynman");
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
        {/* New Chat Button */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={path.includes("feynman")}
                onClick={handleNewChat}
              >
                <SquarePen className="h-4 w-4" />
                <span>New Chat</span>
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
          <SidebarMenu>
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

        {/* History Section */}
        <SidebarGroup className="flex-1 overflow-auto">
          <p className="px-2 pb-1 text-sm font-semibold text-sidebar-foreground/90">
            History
          </p>
          {agentThreads.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            <SidebarMenu>
              {agentThreads
                .sort(
                  (a, b) =>
                    new Date(b.updated_at).getTime() -
                    new Date(a.updated_at).getTime(),
                )
                .slice(0, 5)
                .map((thread) => {
                  const threadId = thread.id;
                  return (
                    <SidebarMenuItem key={thread.evermemos_group_id}>
                      <SidebarMenuButton
                        isActive={path.includes(threadId)}
                        render={<Link href={`/threads/${threadId}`} />}
                      >
                        <span className="truncate">{thread.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
