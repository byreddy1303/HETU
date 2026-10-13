"""Advertise supported OAuth scopes independently of the minimum read scope."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from mcp.server.auth.routes import create_protected_resource_routes
from mcp.server.mcpserver import Context, MCPServer
from mcp.types import CallToolResult, InputRequiredResult
from starlette.applications import Starlette


class HetuMCPServer(MCPServer):
    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        context: Context[Any, Any] | None = None,
    ) -> CallToolResult | InputRequiredResult:
        if isinstance(arguments, dict):
            arguments = dict(arguments)
            tool = self._tool_manager.get_tool(name)
            if tool:
                props = tool.parameters.get("properties", {})
                if "draft" in props and "draft" not in arguments:
                    if "screenshots" in props:
                        screenshots = arguments.pop("screenshots", [])
                        arguments = {"draft": arguments, "screenshots": screenshots}
                    else:
                        arguments = {"draft": arguments}
                elif "request" in props and "request" not in arguments:
                    arguments = {"request": arguments}
                elif "options" in props and "options" not in arguments:
                    arguments = {"options": arguments}

                if "draft" in arguments and isinstance(arguments["draft"], dict):
                    if not arguments["draft"].get("idempotency_key"):
                        arguments["draft"]["idempotency_key"] = f"mcp-{uuid4().hex[:16]}"
                elif "request" in arguments and isinstance(arguments["request"], dict):
                    if not arguments["request"].get("idempotency_key"):
                        arguments["request"]["idempotency_key"] = f"mcp-{uuid4().hex[:16]}"
                elif "idempotency_key" in props and not arguments.get("idempotency_key"):
                    arguments["idempotency_key"] = f"mcp-{uuid4().hex[:16]}"

        return await super().call_tool(name, arguments, context)

    def streamable_http_app(self, **options: Any) -> Starlette:
        app = super().streamable_http_app(**options)
        auth = self.settings.auth
        if auth is not None and auth.resource_server_url is not None:
            routes = create_protected_resource_routes(
                resource_url=auth.resource_server_url,
                authorization_servers=[auth.issuer_url],
                scopes_supported=["hetu:read", "hetu:write"],
                resource_name="HETU",
            )
            paths = {route.path for route in routes}
            app.router.routes[:] = routes + [
                route for route in app.router.routes if getattr(route, "path", None) not in paths
            ]
        return app
