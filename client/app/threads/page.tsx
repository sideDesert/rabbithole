import { listThreads } from "@/lib/api";
import { ThreadCard } from "./thread-card";

export default async function Page() {
  const { threads } = await listThreads();
  return (
    <div className="px-6 py-6 w-3xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Threads</h1>
      {threads.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No threads yet. Start a conversation to create one.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {threads.map((thread) => (
          <ThreadCard
            key={thread.root_thread_id ?? thread.evermemos_group_id}
            thread={thread}
          />
        ))}
      </div>
    </div>
  );
}
