#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "backend" / "config.json"
EXAMPLE_CONFIG_PATH = ROOT / "backend" / "config.example.json"


def prompt(label: str, default: str) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    if value:
        return value
    return default


def main() -> None:
    template = json.loads(EXAMPLE_CONFIG_PATH.read_text())
    existing = template.copy()
    if CONFIG_PATH.exists():
        existing.update(json.loads(CONFIG_PATH.read_text()))

    print("Rabbithole local setup")
    print(f"Writing config to {CONFIG_PATH}")
    print("")

    config = {
        "openrouter_api": prompt("OpenRouter API key", str(existing["openrouter_api"])),
        "evermemos_api": prompt("EverMemOS API key", str(existing["evermemos_api"])),
        "mongo_user": prompt("Mongo user", str(existing["mongo_user"])),
        "mongo_password": prompt("Mongo password", str(existing["mongo_password"])),
        "default_model": prompt("Default model", str(existing["default_model"])),
        "planning_model": prompt("Planning model", str(existing["planning_model"])),
        "scoring_model": prompt("Scoring model", str(existing["scoring_model"])),
        "llm_base_url": prompt("LLM base URL", str(existing["llm_base_url"])),
        "evermemos_base_url": prompt(
            "EverMemOS base URL", str(existing["evermemos_base_url"])
        ),
        "mongo_db_name": prompt("Mongo database name", str(existing["mongo_db_name"])),
        "frontend_origin": prompt(
            "Frontend origin", str(existing["frontend_origin"])
        ),
        "max_tool_rounds": int(
            prompt("Max tool rounds", str(existing["max_tool_rounds"]))
        ),
        "compaction_threshold": float(
            prompt(
                "Compaction threshold",
                str(existing["compaction_threshold"]),
            )
        ),
    }

    CONFIG_PATH.write_text(json.dumps(config, indent=2) + "\n")
    print("")
    print("Config saved.")


if __name__ == "__main__":
    main()
