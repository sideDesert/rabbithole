"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs } from "./ui/tabs";
import { TopBar } from "./top-bar";
import { PlanView } from "./plan-view";
import { usePlan } from "./plan-context";
import { useParams } from "next/navigation";
import { useThread } from "@/hooks/use-thread";
import { useRouter } from "next/navigation";

export function MainContent({ children }: { children: ReactNode }) {
  const { activeTab, setActiveTab } = usePlan();
  const router = useRouter();
  const params = useParams();
  const threadId = params?.threadId as string;
  const { thread } = useThread(threadId);
  const config = {
    back: false,
    title: "",
  };

  if (thread?.title && thread?.title.length > 0) {
    config.title = thread?.title;
  }
  if (thread?.parent_thread_id && thread?.parent_thread_id.length > 0) {
    config.back = true;
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(val) => setActiveTab(val as string)}
      className="w-full"
    >
      <main className="grow grid grid-rows-[auto_1fr]">
        <TopBar
          config={config}
          backToRootHandler={() => {
            console.log({ root_id: thread?.root_thread_id });
            router.push(`/threads/${thread?.root_thread_id}`);
          }}
        />
        {/* Keep page content mounted but hidden when plan tab is active
            so chat state isn't lost on tab switch */}
        <div className={activeTab === "plan-mode" ? "hidden" : ""}>
          {children}
        </div>
        {activeTab === "plan-mode" && <PlanView />}
      </main>
    </Tabs>
  );
}
