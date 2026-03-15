import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeGraph } from "@/lib/api";

export function useKnowledgeGraph(domain?: string) {
  return useQuery({
    queryKey: ["knowledge-graph", domain ?? "all"],
    queryFn: () => fetchKnowledgeGraph(domain),
  });
}
