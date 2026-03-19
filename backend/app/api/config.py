from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import (
    Config,
    ConfigUpdate,
    OpenRouterModel,
    get_config,
    list_openrouter_models,
    save_config,
)

router = APIRouter(prefix="/api/config", tags=["config"])


class ConfigUpdateRequest(BaseModel):
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

    def to_config_update(self) -> ConfigUpdate:
        return ConfigUpdate(
            openrouter_api=self.openrouter_api,
            evermemos_api=self.evermemos_api,
            mongo_user=self.mongo_user,
            mongo_password=self.mongo_password,
            default_model=self.default_model,
            planning_model=self.planning_model,
            scoring_model=self.scoring_model,
            llm_base_url=self.llm_base_url,
            evermemos_base_url=self.evermemos_base_url,
            mongo_db_name=self.mongo_db_name,
            frontend_origin=self.frontend_origin,
            max_tool_rounds=self.max_tool_rounds,
            compaction_threshold=self.compaction_threshold,
        )


@router.get("/")
async def get_config_endpoint() -> Config:
    return get_config()


@router.patch("/")
async def update_config(req: ConfigUpdateRequest) -> Config:
    next_config = get_config().merge(req.to_config_update())

    try:
        models = list_openrouter_models()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch OpenRouter models: {exc}",
        ) from exc

    valid_model_ids = {model.id for model in models}
    submitted_models = {
        "default_model": next_config.default_model,
        "planning_model": next_config.planning_model,
        "scoring_model": next_config.scoring_model,
    }

    invalid_models = {
        key: value
        for key, value in submitted_models.items()
        if value and value not in valid_model_ids
    }
    if invalid_models:
        formatted = ", ".join(
            f"{field}={value}" for field, value in invalid_models.items()
        )
        raise HTTPException(
            status_code=400,
            detail=f"Unknown OpenRouter model id: {formatted}",
        )

    return save_config(req.to_config_update())


class OpenRouterModelsResponse(BaseModel):
    models: list[OpenRouterModel]


@router.get("/models")
async def get_openrouter_models() -> OpenRouterModelsResponse:
    try:
        return OpenRouterModelsResponse(models=list_openrouter_models())
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch OpenRouter models: {exc}",
        ) from exc
