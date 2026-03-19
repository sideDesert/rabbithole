from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, fields
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"
BACKEND_DIR = Path(__file__).resolve().parent.parent
PLANS_DIR = BACKEND_DIR / "plans"


@dataclass
class Config:
    openrouter_api: str = ""
    evermemos_api: str = ""
    mongo_user: str = ""
    mongo_password: str = ""
    default_model: str = "openrouter/hunter-alpha"
    planning_model: str = "openrouter/hunter-alpha"
    scoring_model: str = "openrouter/hunter-alpha"
    llm_base_url: str = "https://openrouter.ai/api/v1"
    evermemos_base_url: str = "https://api.evermind.ai"
    mongo_db_name: str = "rabbithole"
    max_tool_rounds: int = 5
    compaction_threshold: float = 0.4

    @property
    def mongo_uri(self) -> str:
        return f"mongodb+srv://{self.mongo_user}:{self.mongo_password}@evermemos.3ubn8os.mongodb.net/?appName=evermemos"

    def merge(self, u: ConfigUpdate) -> Config:
        """Return a new Config with non-None fields from update applied."""
        current = asdict(self)
        updates = asdict(u)
        merged = {
            key: current[key] if value is None else value
            for key, value in updates.items()
        }
        return Config(**merged)


@dataclass
class ConfigUpdate:
    openrouter_api: str | None = None
    evermemos_api: str | None = None
    mongo_user: str | None = None
    mongo_password: str | None = None
    default_model: str | None = None
    planning_model: str | None = None
    scoring_model: str | None = None
    llm_base_url: str | None = None
    evermemos_base_url: str | None = None
    mongo_db_name: str | None = None
    max_tool_rounds: int | None = None
    compaction_threshold: float | None = None


_config: Config | None = None
_llm: AsyncOpenAI | None = None
_CONFIG_FIELDS = {f.name for f in fields(Config)}


@dataclass
class OpenRouterModel:
    id: str
    name: str
    context_length: int | None = None
    pricing_prompt: str | None = None
    pricing_completion: str | None = None


def get_config() -> Config:
    global _config
    if _config is not None:
        return _config
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            data: dict[str, str | int | float] = json.load(f)
        _config = Config(**{k: v for k, v in data.items() if k in _CONFIG_FIELDS})  # type: ignore[arg-type]
    else:
        _config = Config()
        # Write default config so save_config and other readers always find the file
        with open(CONFIG_PATH, "w") as f:
            json.dump({field.name: getattr(_config, field.name) for field in fields(_config)}, f, indent=2)
    return _config


def get_llm() -> AsyncOpenAI:
    global _llm
    if _llm is None:
        from openai import AsyncOpenAI

        cfg = get_config()
        _llm = AsyncOpenAI(base_url=cfg.llm_base_url, api_key=cfg.openrouter_api)
    return _llm


def save_config(update: ConfigUpdate) -> Config:
    """Merge update into config.json and reload."""
    global _config, _llm
    new_config = get_config().merge(update)
    with open(CONFIG_PATH, "w") as f:
        data = {
            field.name: getattr(new_config, field.name) for field in fields(new_config)
        }
        json.dump(data, f, indent=2)
    _config = new_config
    _llm = None  # invalidate so next get_llm() picks up new keys
    return _config


def list_openrouter_models() -> list[OpenRouterModel]:
    cfg = get_config()
    headers: dict[str, str] = {}
    if cfg.openrouter_api:
        headers["Authorization"] = f"Bearer {cfg.openrouter_api}"

    resp = httpx.get(
        "https://openrouter.ai/api/v1/models",
        headers=headers,
        timeout=10,
    )
    resp.raise_for_status()

    models: list[OpenRouterModel] = []
    for item in resp.json().get("data", []):
        pricing = item.get("pricing") or {}
        models.append(
            OpenRouterModel(
                id=item.get("id", ""),
                name=item.get("name") or item.get("id", ""),
                context_length=item.get("context_length"),
                pricing_prompt=pricing.get("prompt"),
                pricing_completion=pricing.get("completion"),
            )
        )

    models.sort(key=lambda model: model.name.lower())
    return models


@lru_cache(maxsize=1)
def get_model_context_window(model: str | None = None) -> int:
    """Fetch the context window size for the given model from OpenRouter.

    Cached after first call. Falls back to 128k if the request fails.
    """
    if model is None:
        model = get_config().default_model
    try:
        resp = httpx.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {get_config().openrouter_api}"},
            timeout=10,
        )
        _ = resp.raise_for_status()
        for m in resp.json().get("data", []):
            if m.get("id") == model:
                ctx = m.get("context_length", 128_000)
                logger.info("Model %s context_length: %d", model, ctx)
                return int(ctx)
    except Exception as e:
        logger.warning("Failed to fetch model context window: %s", e)
    return 128_000
