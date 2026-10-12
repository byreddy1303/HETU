from __future__ import annotations

import httpx
import pytest

from scripts.verify_mcp_connection import check_connection

RESOURCE = "https://api.hetu.test/mcp"
ISSUER = "https://hetu.test/__clerk"
METADATA = "https://api.hetu.test/.well-known/oauth-protected-resource/mcp"


def public_server(failure: str | None = None) -> httpx.Client:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health/ready":
            return httpx.Response(503 if failure == "quota" else 200)
        if str(request.url) == METADATA:
            return httpx.Response(
                200,
                json={
                    "resource": "https://other.test/mcp" if failure == "audience" else RESOURCE,
                    "authorization_servers": [ISSUER],
                    "scopes_supported": ["hetu:read", "hetu:write"],
                },
            )
        if request.url.path.endswith("/.well-known/openid-configuration"):
            # Clerk's OIDC document need not publish its OAuth CIMD support.
            return httpx.Response(200, json={"issuer": ISSUER})
        if request.url.path.endswith("/.well-known/oauth-authorization-server"):
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "code_challenge_methods_supported": ["S256"],
                    "token_endpoint_auth_methods_supported": ["none"],
                    "client_id_metadata_document_supported": failure != "cimd",
                    "scopes_supported": ["hetu:read", "hetu:write"],
                },
            )
        assert request.method == "POST" and str(request.url) == RESOURCE
        assert "authorization" not in request.headers
        return httpx.Response(
            200 if failure == "anonymous" else 401,
            headers={"www-authenticate": f'Bearer resource_metadata="{METADATA}"'},
        )

    return httpx.Client(transport=httpx.MockTransport(handle))


def test_public_check_requires_discovery_health_and_authentication():
    with public_server() as client:
        result = check_connection(client, RESOURCE, ISSUER)
    assert result["ready"] is True
    assert result["verification_scope"] == "public_discovery_only"


@pytest.mark.parametrize(
    ("failure", "failed_check"),
    [
        ("quota", "api_ready"),
        ("audience", "resource_audience"),
        ("cimd", "cimd_published"),
        ("anonymous", "anonymous_access_rejected"),
    ],
)
def test_public_check_fails_closed_for_live_connection_blockers(failure, failed_check):
    with public_server(failure) as client:
        result = check_connection(client, RESOURCE, ISSUER)
    assert result["ready"] is False
    assert next(c for c in result["checks"] if c["check"] == failed_check)["passed"] is False
