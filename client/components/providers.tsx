"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { PlanProvider } from "@/components/plan-context";
import { AgentProvider } from "@/components/agent-context";
import { FeynmanPollingProvider } from "@/hooks/use-feynman-polling";
import { Toaster } from "sonner";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <SidebarProvider>
          <AgentProvider>
            <PlanProvider>
              <FeynmanPollingProvider>
                {children}
              </FeynmanPollingProvider>
            </PlanProvider>
          </AgentProvider>
        </SidebarProvider>
      </ThemeProvider>
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  );
}
