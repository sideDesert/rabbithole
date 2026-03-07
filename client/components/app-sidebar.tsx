"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Rabbit, MessageSquare, Network, BrainCircuit } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "@/components/ui/sidebar";
const agents = [
  { name: "Ebbinghaus", image: "/agents/ebbinghaus.svg", href: "/ebbinghaus" },
  { name: "Feynman", image: "/agents/feynman.svg", href: "/feynman" },
] as const;

const tools = [
  { name: "Chat Threads", icon: MessageSquare, href: "/threads" },
  { name: "Knowledge Graph", icon: Network, href: "/knowledge-graph" },
  { name: "Memories", icon: BrainCircuit, href: "memories" },
] as const;

export function AppSidebar() {
  const path = usePathname();
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Rabbit className="h-6 w-6" />
          <span className="text-lg font-semibold">rabbithole</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarMenu>
            {agents.map((agent) => (
              <SidebarMenuItem key={agent.name}>
                <SidebarMenuButton
                  isActive={path.includes(agent.href)}
                  render={agent.href ? <Link href={agent.href} /> : undefined}
                >
                  <Image
                    src={agent.image}
                    alt={agent.name}
                    width={20}
                    height={20}
                    className="rounded-full"
                  />
                  <span>{agent.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
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
      </SidebarContent>
    </Sidebar>
  );
}
