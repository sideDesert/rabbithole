"use client";

import { ChatMessage, ROLE_AI, ROLE_USER } from "@/components/chat-message";
import { PromptInput } from "@/components/prompt-input";
import { TextSelectionMenu } from "@/components/text-selection-menu";
import { useTextSelectionMenu } from "@/hooks/use-text-selection-menu";

export default function Page() {
  const { selectedText, messageId, menuPosition, isVisible, clearSelection } =
    useTextSelectionMenu();

  const handleQuote = (data: { messageId: string; text: string }) => {
    console.log("Quote:", data);
    // TODO: insert quoted text into prompt input
  };

  const handleBranch = (data: { messageId: string; text: string }) => {
    console.log("Branch Out:", data);
    // TODO: trigger branch conversation workflow
  };

  return (
    <div className="px-10 pt-4 h-full max-w-3xl m-auto grid grid-rows-[1fr_auto]">
      <div className="flex flex-col overflow-auto relative z-0 gap-4 min-h-0 pb-6">
        <ChatMessage
          id="msg-1"
          role={ROLE_USER}
          content={
            "hey there - can you explain to me what build systems like webpack and rollup do? contrast that with what tectonic CLI by servicenow does - I need to understand them at a deeper level because I need to write some configs"
          }
          className="w-fit self-end"
        />
        <ChatMessage
          id="msg-2"
          role={ROLE_AI}
          content={`Ah gotcha - you want to show loading progress for an async workflow. Here's how industries typically model this:
          Common Patterns
          1. Indeterminate Loading (simplest)

          Just a spinner/progress bar without percentage
          Use when you can't predict duration or track progress
          Good enough for most cases under ~5 seconds

          2. Staged/Step-based Progress

          Break workflow into known stages: "Validating... → Processing... → Finalizing..."
          Show which step you're on (e.g., "Step 2 of 4")
          Works when you have distinct phases but can't measure each one

          3. Percentage-based Progress

          Track actual completion: 0% → 100%
          Requires the backend to report progress
          Most accurate but needs infrastructure

          4. Time-based Estimation

          "Usually takes ~30 seconds"
          Show elapsed time or countdown
          Can combine with indeterminate spinner

          How to Actually Model It
          The architecture usually looks like:
          Frontend clicks → Backend starts job → Returns job ID immediately
          Frontend polls job status every 1-2s → Backend returns progress data
          Frontend updates UI based on progress → Job completes
          For staged progress:
          javascript{
            status: "processing",
            currentStep: "validating_data",
            steps: ["validating_data", "running_calculations", "generating_report"],
            message: "Validating your data..."
          }
          For percentage progress:
          javascript{
            status: "processing",
            progress: 45,
            message: "Processing records: 4500/10000"
          }
          What most companies actually do: Start with indeterminate, then add stages if users complain it feels too slow. Only add true percentage tracking if the workflow is long (>30s) and predictable.
          What kind of workflow are you building? That'll help me suggest the best approach.that's not the problem. The problem is that when we reload - the loading state is lost14 FebAh NOW I get it - the real problem! Yeah, this is a classic issue. When the page reloads mid-workflow, you lose the "hey, something's running" state.
          How Industries Actually Handle This
          1. Persist Job State in Backend (most common)

          When button clicked → create a job record in DB with status "running"
          On page load → check if user has any active jobs
          If yes → show loading UI and resume polling

          javascript// On mount
          useEffect(() => {
            const activeJob = await checkActiveJobs();
            if (activeJob) {
              setLoading(true);
              pollJobStatus(activeJob.id);
            }
          }, []);
          2. Use URL State

          After clicking button, update URL: ?jobId=abc123
          On reload, read jobId from URL
          Resume polling that job
          Works great, also makes it shareable

          3. LocalStorage/SessionStorage (simpler but less reliable)

          Store job ID in localStorage when started
          On mount, check localStorage for pending jobs
          Clear it when job completes
          Downside: can get stale if job finishes on another tab

          4. Server-Sent Events / WebSockets (real-time)

          Backend pushes updates instead of polling
          On reconnect, backend sends current state
          More complex but best UX

          What Most Companies Do
          Simple workflow (<5 min): Backend job table + poll on mount
          javascript// Backend exposes: GET /api/jobs/active
          // Returns: { id, status, progress, startedAt }

          // Frontend on load:
          const activeJob = await fetch('/api/jobs/active');
          if (activeJob) resumePolling(activeJob);
          Long workflow (>5 min): Same as above + show a banner like "You have a report generating in the background" with link to status page
          Mission critical: WebSockets so it never loses sync
          The key insight: the loading state isn't in the frontend - it's in the backend. Your frontend just reflects what the backend knows.
          Does your backend already track job status, or do you need to add that?`}
          className="w-fit self-start"
        />
      </div>
      <PromptInput mode="interview" className="sticky! bottom-0 z-50" />
      <TextSelectionMenu
        visible={isVisible}
        position={menuPosition}
        selectedText={selectedText}
        messageId={messageId}
        onQuote={handleQuote}
        onBranch={handleBranch}
        onActionComplete={clearSelection}
      />
    </div>
  );
}
