import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import MONGO_USER, MONGO_PASSWORD, LLM_API_KEY, PLANS_DIR
from app.db.mongo import get_client
from app.db.indexes import ensure_indexes
from app.api.chat import router as chat_router
from app.api.feynman import router as feynman_router
from app.api.graph import router as graph_router

# --- Validate env ---
for name, val in [("MONGO_USER", MONGO_USER), ("MONGO_PASSWORD", MONGO_PASSWORD), ("OPENROUTER_API_KEY", LLM_API_KEY)]:
    if not val:
        print(f"ERROR: {name} is not set in .env")
        sys.exit(1)

# --- Init ---
try:
    get_client().admin.command("ping")
    print("\033[34m[SYSTEM]\033[0m: Connected to MongoDB!")
except Exception as e:
    print(f"MongoDB connection failed: {e}")

ensure_indexes()
PLANS_DIR.mkdir(parents=True, exist_ok=True)

# --- App ---
app = FastAPI(title="Rabbithole")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(feynman_router)
app.include_router(graph_router)


@app.get("/health")
def health():
    return {"status": "ok"}
