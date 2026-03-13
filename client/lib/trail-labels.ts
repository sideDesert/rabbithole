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
};

export function getTrailLabel(
  type: "status" | "tool_call",
  key: string,
): string {
  const map = type === "status" ? statusLabels : toolCallLabels;
  return map[key] ?? key.toLowerCase();
}
