"""Advertise supported OAuth scopes independently of the minimum read scope."""

from __future__ import annotations

from typing import Any

from mcp.server.auth.routes import create_protected_resource_routes
from mcp.server.mcpserver import MCPServer
from starlette.applications import Starlette


class HetuMCPServer(MCPServer):
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
