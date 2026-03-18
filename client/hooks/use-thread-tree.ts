import { fetchThreadTrees } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function useThreadTree(agent?: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["thread-tree", agent],
    queryFn: () => fetchThreadTrees(agent),
  });

  return { trees: data?.trees ?? [], isLoading, error, refetch };
}
