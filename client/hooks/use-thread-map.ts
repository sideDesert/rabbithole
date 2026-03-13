import { useQuery } from "@tanstack/react-query";
import { fetchThreadMap } from "@/lib/api";

export function useThreadMap(threadId: string | undefined) {
  return useQuery({
    queryKey: ["thread-map", threadId],
    queryFn: () => fetchThreadMap(threadId!),
    enabled: !!threadId,
  });
}
