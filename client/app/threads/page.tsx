import { listThreads } from "@/lib/api";
import { ThreadCard } from "./thread-card";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { threads } = await listThreads();
  return (
    <div className="px-6 py-6 w-3xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-4">Threads</h1>
      {threads.length === 0 && (
        <div className="border-2 border-dashed border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">
            No threads yet. Start a conversation to create one.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {threads
          .filter((thread) => !thread.parent_thread_id)
          .map((thread) => (
            <ThreadCard key={thread.id} thread={thread} />
          ))}
      </div>
    </div>
  );
}
