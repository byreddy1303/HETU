#!/usr/bin/env python3
"""Verify the desktop MCP connection through the same launcher used by local AI clients.

Run with the backend Python environment. All MCP tool calls are read-only; a custom
HETU_DATA_DIR can be supplied to check an isolated workspace instead of the desktop.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
REQUIRED_TOOLS = {
    "get_profile",
    "get_capabilities",
    "search_knowledge",
    "get_concept",
    "save_to_hetu",
    "save_formula",
    "save_question",
    "save_test_analysis",
    "start_task_brief",
    "create_concept_review",
    "get_recovery_overview",
    "list_sections",
    "build_revision_pack",
}


async def verify(node_command: str, data_dir: str | None = None) -> dict[str, Any]:
    env = dict(os.environ)
    if data_dir:
        env["HETU_DATA_DIR"] = data_dir
    params = StdioServerParameters(
        command=node_command,
        args=[str(REPOSITORY_ROOT / "scripts" / "mcp-local.cjs")],
        cwd=REPOSITORY_ROOT,
        env=env,
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=30) as client:
            initialized = await client.initialize()
            advertised = await client.list_tools()
            tools = {tool.name for tool in advertised.tools}
            missing = sorted(REQUIRED_TOOLS - tools)
            if missing:
                raise RuntimeError("Missing MCP tools: " + ", ".join(missing))

            async def read_tool(name: str, arguments: dict[str, Any] | None = None):
                result = await client.call_tool(name, arguments)
                if result.is_error:
                    message = "; ".join(
                        block.text for block in result.content if block.type == "text"
                    )
                    raise RuntimeError(f"{name} failed: {message}")
                if not isinstance(result.structured_content, dict):
                    raise RuntimeError(f"{name} did not return a structured result")
                return result.structured_content

            profile = await read_tool("get_profile")
            capabilities = await read_tool("get_capabilities")
            sections = await read_tool("list_sections")
            concepts = await read_tool("search_knowledge", {"limit": 1})
            if profile.get("profile_id") != "local_user":
                raise RuntimeError("MCP is connected to an unexpected workspace owner")
            if capabilities.get("mode") != "local_desktop":
                raise RuntimeError("MCP is not operating in local desktop mode")
            return {
                "status": "ok",
                "transport": "stdio",
                "server": initialized.server_info.name,
                "tools": len(tools),
                "capabilities": len(capabilities.get("supported", [])),
                "profile_id": profile["profile_id"],
                "display_name": profile.get("display_name"),
                "sections": len(sections.get("sections", [])),
                "saved_concepts_found": len(concepts.get("items", [])),
                "search_complete": concepts.get("complete"),
            }


def _error_messages(exc: BaseException) -> str:
    if isinstance(exc, BaseExceptionGroup):
        return "; ".join(_error_messages(child) for child in exc.exceptions)
    return str(exc)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", help="Check a specific desktop data directory")
    parser.add_argument("--node", default=shutil.which("node"), help="Path to Node.js")
    arguments = parser.parse_args()
    if not arguments.node:
        parser.error("Node.js was not found on PATH; provide --node /path/to/node")
    data_dir = str(Path(arguments.data_dir).expanduser().resolve()) if arguments.data_dir else None
    try:
        result = asyncio.run(verify(arguments.node, data_dir))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": _error_messages(exc)}), file=sys.stderr)
        raise SystemExit(1) from exc
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
