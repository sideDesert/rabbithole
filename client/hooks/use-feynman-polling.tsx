"use client";

import { createContext, useContext, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getFeynmanResult } from "@/lib/api";

interface FeynmanPollingCtx {
  startPolling: (submissionId: string, conceptName: string) => void;
}

const Ctx = createContext<FeynmanPollingCtx>({
  startPolling: () => {},
});

export function FeynmanPollingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const activePolls = useRef(new Set<string>());

  const startPolling = useCallback(
    (submissionId: string, conceptName: string) => {
      if (activePolls.current.has(submissionId)) return;
      activePolls.current.add(submissionId);

      const poll = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const result = await getFeynmanResult(submissionId);
            if (result.status === "scored") {
              toast.success(`Evaluation complete for ${conceptName}`);
              queryClient.invalidateQueries({ queryKey: ["feynman-notes"] });
              queryClient.invalidateQueries({ queryKey: ["evaluations"] });
              activePolls.current.delete(submissionId);
              return;
            }
            if (result.status === "failed") {
              toast.error(`Evaluation failed for ${conceptName}`);
              activePolls.current.delete(submissionId);
              return;
            }
          } catch {
            // Network error — keep polling
          }
        }
        toast.error(`Evaluation timed out for ${conceptName}`);
        activePolls.current.delete(submissionId);
      };

      poll();
    },
    [queryClient],
  );

  return <Ctx value={{ startPolling }}>{children}</Ctx>;
}

export function useFeynmanPolling() {
  return useContext(Ctx);
}
