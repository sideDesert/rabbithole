"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemePersonalityProvider } from "@/components/theme-personality-provider";
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
        <ThemePersonalityProvider>
        <SidebarProvider>
          <AgentProvider>
            <PlanProvider>
              <FeynmanPollingProvider>
                {children}
              </FeynmanPollingProvider>
            </PlanProvider>
          </AgentProvider>
        </SidebarProvider>
        </ThemePersonalityProvider>
      </ThemeProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            color: "var(--card-foreground)",
            border: "2px solid var(--border)",
            boxShadow: "4px 4px 0px 0px var(--border)",
            borderRadius: "6px",
          },
        }}
      />
    </QueryClientProvider>
  );
}
