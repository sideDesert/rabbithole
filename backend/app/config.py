import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

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
