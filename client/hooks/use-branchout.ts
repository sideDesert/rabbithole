import { useMutation } from "@tanstack/react-query";
import { branchout, type BranchoutParams, type BranchoutResponse } from "@/lib/api";

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
