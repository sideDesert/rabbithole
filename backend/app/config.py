from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, fields
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, cast

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
    frontend_origin: str = "http://localhost:3000"
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
    frontend_origin: str | None = None
    max_tool_rounds: int | None = None
    compaction_threshold: float | None = None


_config: Config | None = None
_llm: AsyncOpenAI | None = None
_CONFIG_FIELDS = {f.name for f in fields(Config)}
_REQUIRED_CONFIG_FIELDS = (
    "openrouter_api",
    "evermemos_api",
    "mongo_user",
    "mongo_password",
)


@dataclass
class OpenRouterModel:
    id: str
    name: str
    context_length: int | None = None
    pricing_prompt: str | None = None
    pricing_completion: str | None = None


def _coerce_str(value: object, default: str) -> str:
    return value if isinstance(value, str) else default


def _coerce_int(value: object, default: int) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return default
    return default


def _coerce_float(value: object, default: float) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _load_config_from_dict(data: object) -> Config:
    defaults = Config()

    if not isinstance(data, dict):
        logger.warning("Invalid config payload, falling back to defaults")
        return defaults

    raw_config = cast(dict[object, object], data)
    filtered: dict[str, object] = {
        key: value
        for key, value in raw_config.items()
        if isinstance(key, str) and key in _CONFIG_FIELDS
    }
    return Config(
        openrouter_api=_coerce_str(
            filtered.get("openrouter_api"), defaults.openrouter_api
        ),
        evermemos_api=_coerce_str(
            filtered.get("evermemos_api"), defaults.evermemos_api
        ),
        mongo_user=_coerce_str(filtered.get("mongo_user"), defaults.mongo_user),
        mongo_password=_coerce_str(
            filtered.get("mongo_password"), defaults.mongo_password
        ),
        default_model=_coerce_str(
            filtered.get("default_model"), defaults.default_model
        ),
        planning_model=_coerce_str(
            filtered.get("planning_model"), defaults.planning_model
        ),
        scoring_model=_coerce_str(
            filtered.get("scoring_model"), defaults.scoring_model
        ),
        llm_base_url=_coerce_str(filtered.get("llm_base_url"), defaults.llm_base_url),
        evermemos_base_url=_coerce_str(
            filtered.get("evermemos_base_url"),
            defaults.evermemos_base_url,
        ),
        mongo_db_name=_coerce_str(
            filtered.get("mongo_db_name"), defaults.mongo_db_name
        ),
        frontend_origin=_coerce_str(
            filtered.get("frontend_origin"), defaults.frontend_origin
        ),
        max_tool_rounds=_coerce_int(
            filtered.get("max_tool_rounds"), defaults.max_tool_rounds
        ),
        compaction_threshold=_coerce_float(
            filtered.get("compaction_threshold"), defaults.compaction_threshold
        ),
    )


def _write_config(config: Config) -> None:
    with open(CONFIG_PATH, "w") as f:
        json.dump(
            {field.name: getattr(config, field.name) for field in fields(config)},
            f,
            indent=2,
        )


def get_config() -> Config:
    global _config
    if _config is not None:
        return _config
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            data = json.load(f)
        _config = _load_config_from_dict(data)
    else:
        _config = Config()
        _write_config(_config)
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
    _write_config(new_config)
    _config = new_config
    _llm = None  # invalidate so next get_llm() picks up new keys
    return _config


def get_missing_config_fields(config: Config | None = None) -> list[str]:
    current = config or get_config()
    return [
        field_name
        for field_name in _REQUIRED_CONFIG_FIELDS
        if not str(getattr(current, field_name, "")).strip()
    ]


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
