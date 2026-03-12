"""Integration tests for each agent tool.

Run:  uv run python test_tools.py
"""

import asyncio
import json
import shutil
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from agents.tool_context import ToolContext

from app.config import PLANS_DIR
from app.tools_impl import (
    AgentContext,
    create_plan,
    read_plan,
    recall_memory,
    store_memory,
    suggest_branches,
    update_plan_progress,
)

PASS = "\033[92m✓ PASSED\033[0m"
FAIL = "\033[91m✗ FAILED\033[0m"
WARN = "\033[93m⚠ WARNING\033[0m"

TEST_SLUG = "_test-tools-run"
TEST_PLAN_MD = """\
# Test Topic

> **Depth:** overview | **Prior knowledge:** None

## Phase 1: Basics

- [ ] First Concept — The very first concept
- [ ] Second Concept — The second concept

## Phase 2: Advanced

- [ ] Third Concept — An advanced concept
"""


def make_ctx(topic_slug: str = TEST_SLUG, tool_name: str = "test") -> ToolContext[AgentContext]:
    agent_ctx = AgentContext(
        user_id="test_user_001",
        thread_id="test_thread_001",
        topic_slug=topic_slug,
        group_id="test_group_001",
    )
    return ToolContext(
        context=agent_ctx,
        tool_name=tool_name,
        tool_call_id="test_call",
        tool_arguments="{}",
    )


def header(name: str):
    print(f"\n{'=' * 60}")
    print(f"  {name}")
    print(f"{'=' * 60}")


def seed_test_plan():
    """Write a known plan to disk for read/update tests."""
    plan_dir = PLANS_DIR / TEST_SLUG
    plan_dir.mkdir(parents=True, exist_ok=True)
    (plan_dir / "notes").mkdir(exist_ok=True)
    (plan_dir / "plan.md").write_text(TEST_PLAN_MD)


def cleanup_test_plan():
    plan_dir = PLANS_DIR / TEST_SLUG
    if plan_dir.exists():
        shutil.rmtree(plan_dir)


# ── Individual tests ─────────────────────────────────────────────────────


async def test_store_memory() -> bool:
    header("store_memory → EverMemOS")
    ctx = make_ctx()
    result = await store_memory.on_invoke_tool(
        ctx, json.dumps({"fact": "Test user prefers visual explanations"})
    )
    data = json.loads(result)
    print(f"  Result: {json.dumps(data, indent=2)}")

    if "error" in data:
        print(f"  {WARN} store_memory error: {data['error']}")
        return False

    ok = data.get("status") == "stored"
    print(f"  {PASS if ok else FAIL}")
    return ok


async def test_recall_memory() -> bool:
    header("recall_memory → EverMemOS")
    ctx = make_ctx()
    result = await recall_memory.on_invoke_tool(
        ctx, json.dumps({"query": "learning preferences"})
    )
    data = json.loads(result)
    preview = json.dumps(data, indent=2)[:500]
    print(f"  Result: {preview}")

    if "error" in data:
        print(f"  {WARN} recall_memory error: {data['error']}")
        return False

    ok = "memories" in data
    print(f"  Found {len(data.get('memories', []))} memories")
    print(f"  {PASS if ok else FAIL}")
    return ok


async def test_read_plan() -> bool:
    header("read_plan (filesystem)")
    seed_test_plan()
    ctx = make_ctx()
    result = await read_plan.on_invoke_tool(ctx, json.dumps({"topic_slug": TEST_SLUG}))
    data = json.loads(result)
    print(f"  Progress: {data.get('progress')}")
    print(f"  Current concept: {data.get('current_concept')}")
    print(f"  Overall progress: {data.get('overall_progress')}")

    ok = (
        data.get("current_concept") == "First Concept"
        and data.get("overall_progress") == 0.0
        and "plan_content" in data
    )
    print(f"  {PASS if ok else FAIL}")
    return ok


async def test_update_plan_progress() -> bool:
    header("update_plan_progress (filesystem)")
    seed_test_plan()
    ctx = make_ctx()

    result = await update_plan_progress.on_invoke_tool(
        ctx, json.dumps({"concept_name": "First Concept"})
    )
    data = json.loads(result)
    print(f"  Result: {json.dumps(data, indent=2)}")

    if not data.get("updated"):
        print(f"  {FAIL} — concept not marked complete")
        return False

    verify = await read_plan.on_invoke_tool(ctx, json.dumps({"topic_slug": TEST_SLUG}))
    verify_data = json.loads(verify)
    print(f"  After update — progress: {verify_data.get('progress')}, "
          f"current: {verify_data.get('current_concept')}")

    ok = (
        verify_data.get("current_concept") == "Second Concept"
        and verify_data.get("overall_progress") > 0
    )
    print(f"  {PASS if ok else FAIL}")
    return ok


async def test_create_plan() -> bool:
    header("create_plan → LLM + filesystem")
    test_slug = "_test-create-plan"
    test_dir = PLANS_DIR / test_slug
    if test_dir.exists():
        shutil.rmtree(test_dir)

    ctx = make_ctx(topic_slug=test_slug)
    print("  Calling LLM to generate plan (this may take 15-30s)...")
    result = await create_plan.on_invoke_tool(
        ctx,
        json.dumps({
            "topic": "Binary Search Trees",
            "user_context": "CS student, knows basic arrays and linked lists",
            "depth": "overview",
        }),
    )
    data = json.loads(result)
    print(f"  Topic slug: {data.get('topic_slug')}")
    print(f"  Phases: {data.get('phase_count')}")
    print(f"  Concepts: {data.get('concept_count')}")

    plan_path = Path(data.get("plan_path", ""))
    on_disk = plan_path.exists() if plan_path else False
    print(f"  Plan on disk: {on_disk}")

    if on_disk:
        content = plan_path.read_text()
        print(f"  Plan preview:\n    {content[:300].replace(chr(10), chr(10) + '    ')}")

    ok = (
        data.get("concept_count", 0) > 0
        and data.get("phase_count", 0) > 0
        and on_disk
    )
    print(f"  {PASS if ok else FAIL}")

    if test_dir.exists():
        shutil.rmtree(test_dir)
    return ok


async def test_suggest_branches() -> bool:
    header("suggest_branches → LLM")
    ctx = make_ctx()
    print("  Calling LLM for branch suggestions...")
    result = await suggest_branches.on_invoke_tool(
        ctx,
        json.dumps({
            "current_topic": "Binary Search Trees",
            "context": "Learner just finished understanding tree rotations",
        }),
    )
    print(f"  Raw result: {result[:500]}")

    try:
        data = json.loads(result)
        ok = isinstance(data, (list, dict))
        if isinstance(data, dict):
            branches = data.get("suggestions", data.get("branches", data.get("topics", [])))
            print(f"  Branches found: {len(branches) if isinstance(branches, list) else 'N/A'}")
        print(f"  {PASS if ok else FAIL}")
        return ok
    except json.JSONDecodeError:
        print(f"  {FAIL} — response is not valid JSON")
        return False


# ── Runner ───────────────────────────────────────────────────────────────


async def main():
    results: dict[str, bool] = {}

    # Fast / local tests first
    results["read_plan"] = await test_read_plan()
    results["update_plan_progress"] = await test_update_plan_progress()

    # EverMemOS tests (network)
    results["store_memory"] = await test_store_memory()
    results["recall_memory"] = await test_recall_memory()

    # LLM tests (network, slower)
    results["create_plan"] = await test_create_plan()
    results["suggest_branches"] = await test_suggest_branches()

    # Cleanup
    cleanup_test_plan()

    # Summary
    print(f"\n{'=' * 60}")
    print("  SUMMARY")
    print(f"{'=' * 60}")
    for name, passed in results.items():
        status = PASS if passed else FAIL
        print(f"  {status}  {name}")

    total = len(results)
    passed = sum(results.values())
    print(f"\n  {passed}/{total} passed")


if __name__ == "__main__":
    asyncio.run(main())
