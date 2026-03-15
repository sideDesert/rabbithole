const statusLabels: Record<string, string> = {
  load_thread: "Retracing your steps...",
  build_context: "Piecing things together...",
  load_history: "Thumbing through notes...",
  store_memory: "Committing to memory...",
  build_agent: "Warming up...",
  thinking: "Mulling it over...",
  save_message: "Tucking that away...",
  save_response: "Tidying up...",
};

const toolCallLabels: Record<string, string> = {
  recall_memory: "Rummaging...",
  store_memory: "Jotting down...",
  create_plan: "Sketching a roadmap...",
  read_plan: "Checking the map...",
  update_plan_progress: "Ticking off progress...",
  suggest_branches: "Spotting rabbit holes...",
  offer_branch: "Offering a rabbit hole...",
  park_topic: "Bookmarking for later...",
  get_parked_topics: "Checking bookmarks...",
};

const toolCallDoneLabels: Record<string, string> = {
  recall_memory: "Memory recalled",
  store_memory: "Memory stored",
  create_plan: "Plan created",
  read_plan: "Plan read",
  update_plan_progress: "Progress updated",
  suggest_branches: "Branches suggested",
  offer_branch: "Branch offered",
  park_topic: "Topic parked",
  get_parked_topics: "Bookmarks checked",
};

export function getTrailLabel(
  type: "status" | "tool_call" | "tool_call_done",
  key: string,
): string {
  const map =
    type === "status"
      ? statusLabels
      : type === "tool_call_done"
        ? toolCallDoneLabels
        : toolCallLabels;
  return map[key] ?? key.replace(/_/g, " ");
}
