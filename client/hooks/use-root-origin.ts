import { getThread, Thread } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface RootOrigin {
  /** The root thread of the branch chain */
  rootThread: Thread;
  /** The message ID in the root thread where the chain branched from */
  rootMessageId: string;
  /** Full ancestry from root → current (excludes current thread) */
  ancestry: Thread[];
}

/**
 * Given any thread, walks up the parent chain to find:
 * 1. The root thread
 * 2. The message in the root thread where the branch chain originated
 * 3. The full ancestry for breadcrumbs
 *
 * Returns null for root threads (depth 0).
 */
async function resolveRootOrigin(
  threadId: string,
): Promise<RootOrigin | null> {
  let current = await getThread(threadId);

  // Already at root — nothing to resolve
  if (!current.parent_thread_id) return null;

  // Walk up, collecting ancestry
  const ancestry: Thread[] = [];

  while (current.parent_thread_id) {
    const parent = await getThread(current.parent_thread_id);
    ancestry.unshift(parent);

    // If the parent is the root, current's branch_source_message_id
    // is the message in the root thread where the chain started
    if (!parent.parent_thread_id) {
      return {
        rootThread: parent,
        rootMessageId: current.branch_source_message_id!,
        ancestry,
      };
    }

    current = parent;
  }

  // Shouldn't reach here, but just in case
  return null;
}

export function useRootOrigin(threadId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["root-origin", threadId],
    queryFn: () => resolveRootOrigin(threadId!),
    enabled: !!threadId,
    staleTime: Infinity, // ancestry doesn't change
  });

  return { rootOrigin: data ?? null, isLoading, error };
}
