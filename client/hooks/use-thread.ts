import { getThread } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function useThread(threadId: string | null) {
  const {
    data: thread,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => {
      if (threadId) {
        return getThread(threadId);
      }
    },
    enabled: !!threadId,
  });

  return { thread, isLoading, error };
}
