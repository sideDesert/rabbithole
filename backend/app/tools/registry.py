"""Tool registration and dispatch for the agent loop.

Usage:
    @tool_registry.register(
        agents=["feynman"],
        description="Branch into a sub-concept for deeper learning.",
        parameters={
            "type": "object",
            "properties": {
                "sub_topic": {"type": "string", "description": "The sub-concept to explore"},
            },
            "required": ["sub_topic"],
        },
    )
    async def explore_concept(sub_topic: str, *, ctx: ToolContext) -> dict:
        ...
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Awaitable

from pymongo.database import Database
from openai import OpenAI


@dataclass
class ToolContext:
    """Passed to every tool handler. Contains everything a tool might need."""

    user_id: str
    thread_id: str
    db: Database
    llm_client: OpenAI
    topic_slug: str | None = None


@dataclass
class ToolDef:
    """Internal representation of a registered tool."""

    name: str
    description: str
    parameters: dict[str, Any]
    agents: list[str]
    handler: Callable[..., Awaitable[Any]]


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, ToolDef] = {}

    def register(
        self,
        *,
        agents: list[str],
        description: str,
        parameters: dict[str, Any],
    ):
        """Decorator to register a tool function."""

        def decorator(fn: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
            self._tools[fn.__name__] = ToolDef(
                name=fn.__name__,
                description=description,
                parameters=parameters,
                agents=agents,
                handler=fn,
            )
            return fn

        return decorator

    def get_openai_tools(self, agent_name: str) -> list[dict[str, Any]]:
        """Return OpenAI-formatted tool definitions for a given agent."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._tools.values()
            if agent_name in t.agents
        ]

    async def execute(
        self,
        name: str,
        arguments: str | dict,
        ctx: ToolContext,
    ) -> Any:
        """Execute a tool by name with JSON arguments string."""
        tool = self._tools.get(name)
        if tool is None:
            return {"error": f"Unknown tool: {name}"}

        if isinstance(arguments, str):
            args = json.loads(arguments)
        else:
            args = arguments

        return await tool.handler(**args, ctx=ctx)

    def names(self) -> list[str]:
        return list(self._tools.keys())


# Global registry — tools register themselves on import
tool_registry = ToolRegistry()
