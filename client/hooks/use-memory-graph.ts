import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMemoryGraph, syncMemoryGraph } from "@/lib/api";

export function useMemoryGraph(entityType?: string, domain?: string) {
  return useQuery({
    queryKey: ["memory-graph", entityType ?? "all", domain ?? "all"],
    queryFn: () => fetchMemoryGraph(entityType, domain),
  });
}

export function useSyncMemoryGraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncMemoryGraph,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory-graph"] }),
  });
}
