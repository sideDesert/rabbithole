import asyncio
import logging
import sys
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import MONGO_USER, MONGO_PASSWORD, LLM_API_KEY, PLANS_DIR
from app.db.mongo import get_client
from app.db.indexes import ensure_indexes
from app.api.chat import router as chat_router
from app.api.ebbinghaus import router as ebbinghaus_router
from app.api.feynman import router as feynman_router
from app.api.graph import router as graph_router
from app.api.memory_graph import router as memory_graph_router

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

# --- Foresight polling background loop ---

_logger = logging.getLogger("foresight_poller")


async def _foresight_poll_loop():
    """Poll EverMemOS foresights every hour to create review schedules."""
    while True:
        try:
            from app.services.foresight_poller import poll_foresights

            created = await poll_foresights("user_001")
            if created:
                _logger.info("Foresight poll created %d new review schedules", created)
        except Exception as e:
            _logger.warning("Foresight poll failed: %s", e)
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_foresight_poll_loop())
    yield
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)


# --- App ---
app = FastAPI(title="Rabbithole", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger(__name__).exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={"Access-Control-Allow-Origin": "http://localhost:3000"},
    )

app.include_router(chat_router)
app.include_router(ebbinghaus_router)
app.include_router(feynman_router)
app.include_router(graph_router)
app.include_router(memory_graph_router)


@app.get("/health")
def health():
    return {"status": "ok"}
