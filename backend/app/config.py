import logging
import os
from functools import lru_cache
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# --- Required env vars ---
MONGO_USER = os.environ.get("MONGO_USER", "")
MONGO_PASSWORD = os.environ.get("MONGO_PASSWORD", "")
EVERMEMOS_API = os.environ.get("EVERMEMOS_API", "")

# --- Paths ---
BACKEND_DIR = Path(__file__).resolve().parent.parent
PLANS_DIR = BACKEND_DIR / "plans"

# --- LLM (OpenRouter) ---
LLM_BASE_URL = "https://openrouter.ai/api/v1"
LLM_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
DEFAULT_MODEL = "openrouter/hunter-alpha"
PLANNING_MODEL = "openrouter/hunter-alpha"
SCORING_MODEL = "openrouter/hunter-alpha"


# --- EverMemOS Cloud ---
EVERMEMOS_BASE_URL = "https://api.evermind.ai"

# --- MongoDB ---
MONGO_URI = f"mongodb+srv://{MONGO_USER}:{MONGO_PASSWORD}@evermemos.3ubn8os.mongodb.net/?appName=evermemos"
MONGO_DB_NAME = "rabbithole"

# --- Agent ---
MAX_TOOL_ROUNDS = 5
COMPACTION_THRESHOLD = 0.4  # use summary instead of full parent history above this


@lru_cache(maxsize=1)
def get_model_context_window(model: str = DEFAULT_MODEL) -> int:
    """Fetch the context window size for the given model from OpenRouter.

    Cached after first call. Falls back to 128k if the request fails.
    """
    try:
        resp = httpx.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {LLM_API_KEY}"},
            timeout=10,
        )
        resp.raise_for_status()
        for m in resp.json().get("data", []):
            if m.get("id") == model:
                ctx = m.get("context_length", 128_000)
                logger.info("Model %s context_length: %d", model, ctx)
                return int(ctx)
    except Exception as e:
        logger.warning("Failed to fetch model context window: %s", e)
    return 128_000
