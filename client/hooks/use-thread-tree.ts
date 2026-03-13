import { fetchThreadTrees } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function useThreadTree() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["thread-tree"],
    queryFn: fetchThreadTrees,
  });

  return { trees: data?.trees ?? [], isLoading, error };
}
