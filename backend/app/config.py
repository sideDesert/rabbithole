import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# --- Required env vars ---
MONGO_USER = os.environ.get("MONGO_USER", "")
MONGO_PASSWORD = os.environ.get("MONGO_PASSWORD", "")
OPENROUTER_API = os.environ.get("OPENROUTER_API", "")
EVERMEMOS_API = os.environ.get("EVERMEMOS_API", "")

# --- Paths ---
BACKEND_DIR = Path(__file__).resolve().parent.parent
PLANS_DIR = BACKEND_DIR / "plans"

# --- LLM ---
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "google/gemini-2.0-flash-001"
PLANNING_MODEL = "google/gemini-2.0-flash-001"
SCORING_MODEL = "google/gemini-2.0-flash-001"

# --- EverMemOS ---
EVERMEMOS_BASE_URL = "http://localhost:1995"

# --- MongoDB ---
MONGO_URI = f"mongodb+srv://{MONGO_USER}:{MONGO_PASSWORD}@evermemos.3ubn8os.mongodb.net/?appName=evermemos"
MONGO_DB_NAME = "rabbithole"

# --- Agent ---
MAX_TOOL_ROUNDS = 5
