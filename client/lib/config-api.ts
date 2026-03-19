const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api";

export interface AppConfig {
  openrouter_api: string;
  evermemos_api: string;
  mongo_user: string;
  mongo_password: string;
  default_model: string;
  planning_model: string;
  scoring_model: string;
  llm_base_url: string;
  evermemos_base_url: string;
  mongo_db_name: string;
  frontend_origin: string;
  max_tool_rounds: number;
  compaction_threshold: number;
}

export type AppConfigUpdate = Partial<AppConfig>;

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number | null;
  pricing_prompt: string | null;
  pricing_completion: string | null;
}

async function parseConfigResponse(res: Response): Promise<AppConfig> {
  if (!res.ok) {
    let detail = `Config request failed with status ${res.status}`;

    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) {
        detail = data.detail;
      }
    } catch {
      // Ignore non-JSON error responses.
    }

    throw new Error(detail);
  }

  return res.json();
}

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/config/`);
  return parseConfigResponse(res);
}

export async function updateConfig(
  config: AppConfigUpdate,
): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/config/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  return parseConfigResponse(res);
}

export async function getOpenRouterModels(): Promise<{
  models: OpenRouterModel[];
}> {
  const res = await fetch(`${API_BASE}/config/models`);

  if (!res.ok) {
    throw new Error(`Model request failed with status ${res.status}`);
  }

  return res.json();
}
