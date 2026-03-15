import { getStudyTopics } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function useStudyTopics(limit?: number) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["study-topics", limit],
    queryFn: () => getStudyTopics(limit),
  });

  return {
    topics: data?.topics ?? [],
    isLoading,
    error,
  };
}
