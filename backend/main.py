import sys
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from openai import OpenAI

from app.config import (
    MONGO_USER,
    MONGO_PASSWORD,
    OPENROUTER_API,
    OPENROUTER_BASE_URL,
    PLANS_DIR,
)
from app.db.mongo import get_client, get_db
from app.db.indexes import ensure_indexes
from app.models.thread import Thread
from app.agent.loop import run_agent_loop

# Import tool modules so they register with the registry
import app.tools.thread_tools  # noqa: F401
import app.tools.plan_tools  # noqa: F401
import app.tools.memory_tools  # noqa: F401
import app.tools.mastery_tools  # noqa: F401
import app.tools.note_tools  # noqa: F401

# --- Validate env ---
key_valid = True
for name, val in [("MONGO_USER", MONGO_USER), ("MONGO_PASSWORD", MONGO_PASSWORD), ("OPENROUTER_API", OPENROUTER_API)]:
    if not val:
        key_valid = False
        print(f"ERROR: {name} is not set in .env")
if not key_valid:
    sys.exit(1)

# --- Init clients ---
try:
    get_client().admin.command("ping")
    print("\033[34m[SYSTEM]\033[0m: Connected to MongoDB!")
except Exception as e:
    print(f"MongoDB connection failed: {e}")

ensure_indexes()
PLANS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Rabbithole")
llm_client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=OPENROUTER_API)

db = get_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws/{thread_id}")
async def websocket_endpoint(ws: WebSocket, thread_id: str):
    await ws.accept()

    # TODO: get user_id from auth — hardcoded for hackathon
    user_id = "user_001"

    # If thread_id is "new", create a fresh root thread
    if thread_id == "new":
        thread = Thread(
            user_id=user_id,
            title="New Conversation",
            topic_slug="",
            evermemos_group_id=str(uuid.uuid4()),
        )
        thread.root_thread_id = thread.id
        from app.db import mongo
        mongo.threads().insert_one(thread.to_doc())
        thread_id = thread.id
        await ws.send_json({"type": "thread_created", "thread_id": thread_id})

    try:
        while True:
            data = await ws.receive_json()
            content = data.get("content", "")
            if not content:
                continue

            await run_agent_loop(
                ws=ws,
                user_message=content,
                thread_id=thread_id,
                user_id=user_id,
                agent_name="feynman",
                llm_client=llm_client,
                db=db,
            )
    except WebSocketDisconnect:
        pass
