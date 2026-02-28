import os
import sys

from dotenv import load_dotenv
from fastapi import FastAPI
from openai import OpenAI
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

load_dotenv()

MONGO_USER = os.environ.get("MONGO_USER", "")
MONGO_PASSWORD = os.environ.get("MONGO_PASSWORD", "")
OPENROUTER_API = os.environ.get("OPENROUTER_API", "")

key_valid = True
if not MONGO_USER:
    key_valid = False
    print("ERROR: MONGO_USER is not set in .env")
if not MONGO_PASSWORD:
    key_valid = False
    print("ERROR: MONGO_PASSWORD is not set in .env")
if not OPENROUTER_API:
    key_valid = False
    print("ERROR: OPENROUTER_API is not set in .env")

if not key_valid:
    sys.exit(1)

uri = f"mongodb+srv://{MONGO_USER}:{MONGO_PASSWORD}@evermemos.3ubn8os.mongodb.net/?appName=evermemos"
mongo_client = MongoClient(uri, server_api=ServerApi("1"))

try:
    mongo_client.admin.command("ping")
    print("\033[34m[SYSTEM]\033[0m: Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)

app = FastAPI()
llm_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API,
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/test")
def test():
    response = llm_client.chat.completions.create(
        model="qwen/qwen3-vl-30b-a3b-thinking",
        max_tokens=1024,
        messages=[{"role": "user", "content": "What is the meaning of life?"}],
    )
    print(response.choices[0].message.content)
    return response
