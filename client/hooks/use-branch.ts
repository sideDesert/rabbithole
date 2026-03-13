import { useMutation, useQuery } from "@tanstack/react-query";
import {
  branchout,
  listBranches,
  type Branch,
  type BranchoutParams,
  type BranchoutResponse,
} from "@/lib/api";

interface UseBranchoutOptions {
  onSuccess?: (res: BranchoutResponse, vars: BranchoutParams) => void;
}

export function useBranchout({ onSuccess }: UseBranchoutOptions = {}) {
  const mutation = useMutation({
    mutationFn: branchout,
    onSuccess,
  });

  return {
    branch: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}

export function useBranches(threadId: string | undefined) {
  return useQuery<{ branches: Branch[] }>({
    queryKey: ["branches", threadId],
    queryFn: () => listBranches(threadId!),
    enabled: !!threadId,
  });
}
