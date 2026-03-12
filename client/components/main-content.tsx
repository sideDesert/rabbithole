"use client";

import { type ReactNode } from "react";
import { Tabs } from "./ui/tabs";
import { TopBar } from "./top-bar";
import { PlanView } from "./plan-view";
import { usePlan } from "./plan-context";

export function MainContent({ children }: { children: ReactNode }) {
  const { activeTab, setActiveTab } = usePlan();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(val) => setActiveTab(val as string)}
      className="w-full"
    >
      <main className="grow grid grid-rows-[auto_1fr]">
        <TopBar />
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
