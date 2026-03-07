import { listThreads } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function useThreads() {
  const {
    data: threads,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["threads"],
    queryFn: listThreads,
  });

  return {
    threads,
    isLoading,
    error,
  };
}
