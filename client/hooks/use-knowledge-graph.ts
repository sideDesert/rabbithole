import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeGraph } from "@/lib/api";

export function useKnowledgeGraph() {
  return useQuery({
    queryKey: ["knowledge-graph"],
    queryFn: fetchKnowledgeGraph,
  });
}
