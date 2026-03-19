"use client";

import { type ReactNode } from "react";
import { Tabs } from "./ui/tabs";
import { TopBar } from "./top-bar";
import { PlanView } from "./plan-view";
import { usePlan } from "./plan-context";
import { ThreadMap } from "@/components/graph/thread-map";
import { useParams, useSearchParams } from "next/navigation";
import { useThread } from "@/hooks/use-thread";
import { useRootOrigin } from "@/hooks/use-root-origin";
import { useRouter } from "next/navigation";

function getSelectedTab(
  threadId: string | undefined,
  requestedTab: string | null,
  activeTab: string,
): string {
  if (!threadId) return "chat-mode";
  if (
    requestedTab === "chat-mode" ||
    requestedTab === "plan-mode" ||
    requestedTab === "graph-mode"
  ) {
    return requestedTab;
  }
  return activeTab;
}

export function MainContent({ children }: { children: ReactNode }) {
  const { activeTab, setActiveTab, setFeynmanRequested } = usePlan();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const threadId = params?.threadId as string;
  const requestedTab = searchParams.get("tab");
  const selectedTab = getSelectedTab(threadId, requestedTab, activeTab);
  const { thread } = useThread(threadId);
  const { rootOrigin } = useRootOrigin(threadId);

  const hasThread = !!threadId;
  const config = {
    back: false,
    title: "",
    progress: hasThread,
    tabs: hasThread,
  };

  if (thread?.title && thread?.title.length > 0) {
    config.title = thread?.title;
  }
  if (thread?.parent_thread_id && thread?.parent_thread_id.length > 0) {
    config.back = true;
  }

  return (
    <Tabs
      value={selectedTab}
      onValueChange={(val) => {
        if (val === "feynman-mode") {
          setFeynmanRequested(true);
          return;
        }
        setActiveTab(val as string);
      }}
      className="w-full"
    >
      <main className="grow grid grid-rows-[auto_1fr] bg-background">
        <TopBar
          config={config}
          threadStatus={thread?.status}
          threadDepth={thread?.depth}
          backToRootHandler={() => {
            if (rootOrigin) {
              const scrollParam = rootOrigin.rootMessageId
                ? `?scrollTo=${rootOrigin.rootMessageId}`
                : "";
              router.push(`/threads/${rootOrigin.rootThread.id}${scrollParam}`);
            } else if (thread?.root_thread_id) {
              router.push(`/threads/${thread.root_thread_id}`);
            }
          }}
          backToParentHandler={() => {
            if (thread?.parent_thread_id) {
              const scrollparam = thread.branch_source_message_id
                ? `?scrollTo=${thread.branch_source_message_id}${thread.branch_point_id ? `&branchPointId=${thread.branch_point_id}` : ""}`
                : "";
              router.push(`/threads/${thread.parent_thread_id}${scrollparam}`);
            }
          }}
        />
        {/* Keep page content mounted but hidden when plan or graph tab is active
            so chat state isn't lost on tab switch */}
        <div className={selectedTab !== "chat-mode" ? "hidden" : ""}>
          {children}
        </div>
        {selectedTab === "plan-mode" && <PlanView />}
        {selectedTab === "graph-mode" && threadId && (
          <ThreadMap threadId={threadId} />
        )}
      </main>
    </Tabs>
  );
}
