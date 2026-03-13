import { listThreads } from "@/lib/api";
import { ThreadCard } from "./thread-card";

export default async function Page() {
  const { threads } = await listThreads();
  console.log({ threads });
  return (
    <div className="px-6 py-6 w-3xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Threads</h1>
      {threads.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No threads yet. Start a conversation to create one.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {threads
          .filter((thread) => !thread.parent_thread_id)
          .map((thread) => (
            <ThreadCard key={thread.id} thread={thread} />
          ))}
      </div>
    </div>
  );
}
