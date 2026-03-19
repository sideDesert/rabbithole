"""Quick test script to inspect LLM API response shapes (works with any provider)."""
# pyright: reportCallIssue=false, reportArgumentType=false, reportPossiblyUnboundVariable=false
import os
import json
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

from app.config import get_config

_cfg = get_config()
client = OpenAI(
    base_url=_cfg.llm_base_url,
    api_key=_cfg.openrouter_api,
)

MODEL = _cfg.default_model

# --- Test 1: Normal response ---
print("=" * 60)
print("TEST 1: Normal (non-streaming) response")
print("=" * 60)
resp = client.chat.completions.create(
    model=MODEL,
    max_tokens=100,
    messages=[{"role": "user", "content": "Say hello in exactly 5 words."}],
)
print(f"Type: {type(resp)}")
print(f"Full response:\n{resp.model_dump_json(indent=2)}")

# --- Test 2: Streaming response ---
print("\n" + "=" * 60)
print("TEST 2: Streaming response")
print("=" * 60)
stream = client.chat.completions.create(
    model=MODEL,
    max_tokens=100,
    messages=[{"role": "user", "content": "Count from 1 to 5."}],
    stream=True,
)
print("Chunks:")
for i, chunk in enumerate(stream):
    d = chunk.model_dump()
    # Only print first 3 and last chunk to keep output manageable
    if i < 3:
        print(f"  chunk[{i}]: {json.dumps(d, indent=2)}")
    elif i == 3:
        print(f"  ... (more chunks) ...")
print(f"  Total chunks: {i + 1}")

# --- Test 3: Tool calling response ---
print("\n" + "=" * 60)
print("TEST 3: Tool calling response")
print("=" * 60)
tools = [
    {
        "type": "function",
        "function": {
            "name": "explore_concept",
            "description": "Branch into a sub-concept for deeper learning.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sub_topic": {
                        "type": "string",
                        "description": "The sub-concept to explore",
                    },
                },
                "required": ["sub_topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_mastery",
            "description": "Look up the user's mastery score for a concept.",
            "parameters": {
                "type": "object",
                "properties": {
                    "concept": {
                        "type": "string",
                        "description": "Concept name to check",
                    },
                },
                "required": ["concept"],
            },
        },
    },
]

resp_tools = client.chat.completions.create(
    model=MODEL,
    max_tokens=200,
    messages=[
        {
            "role": "system",
            "content": "You are a teaching assistant. Use tools when appropriate.",
        },
        {
            "role": "user",
            "content": "I want to learn more about the borrow checker in Rust.",
        },
    ],
    tools=tools,
)
print(f"Full response:\n{resp_tools.model_dump_json(indent=2)}")

# --- Test 4: Streaming + tool calling ---
print("\n" + "=" * 60)
print("TEST 4: Streaming + tool calling")
print("=" * 60)
stream_tools = client.chat.completions.create(
    model=MODEL,
    max_tokens=200,
    messages=[
        {
            "role": "system",
            "content": "You are a teaching assistant. Always use the explore_concept tool when a user asks about a new topic.",
        },
        {
            "role": "user",
            "content": "I want to learn about the borrow checker.",
        },
    ],
    tools=tools,
    stream=True,
)
print("Chunks:")
for i, chunk in enumerate(stream_tools):
    d = chunk.model_dump()
    if i < 5 or (d.get("choices") and d["choices"][0].get("finish_reason")):
        print(f"  chunk[{i}]: {json.dumps(d, indent=2)}")
    elif i == 5:
        print(f"  ... (more chunks) ...")
print(f"  Total chunks: {i + 1}")
