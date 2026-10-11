"""Read-only public checks for a deployed HETU MCP endpoint and OAuth issuer."""

from __future__ import annotations

import argparse
import json
from typing import Any
from urllib.parse import urlsplit

import httpx


def check_connection(client: httpx.Client, resource_url: str, issuer: str) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, detail: Any = None) -> None:
        checks.append({"check": name, "passed": passed, "detail": detail})

    resource = urlsplit(resource_url)
    authority = urlsplit(issuer)
    if not (
        resource.scheme == "https"
        and resource.hostname
        and resource.path == "/mcp"
        and not resource.query
        and not resource.fragment
        and not resource.username
        and authority.scheme == "https"
        and authority.hostname
        and not authority.query
        and not authority.fragment
        and not authority.username
    ):
        return {"ready": False, "checks": [{"check": "canonical_https_urls", "passed": False}]}
    base = resource_url.removesuffix("/mcp")
    metadata_url = base + "/.well-known/oauth-protected-resource/mcp"
    try:
        response = client.get(base + "/health/ready")
        check("api_ready", response.status_code == 200, response.status_code)
        response = client.get(metadata_url)
        check("protected_resource_discovery", response.status_code == 200, response.status_code)
        metadata = response.json() if response.status_code == 200 else {}
        check("resource_audience", metadata.get("resource") == resource_url)
        check("authorization_server", issuer in metadata.get("authorization_servers", []))
        scopes = metadata.get("scopes_supported", [])
        check("resource_scopes", {"hetu:read", "hetu:write"}.issubset(scopes), scopes)
        response = client.get(issuer.rstrip("/") + "/.well-known/openid-configuration")
        check("issuer_discovery", response.status_code == 200, response.status_code)
        auth = response.json() if response.status_code == 200 else {}
        check("issuer_identity", auth.get("issuer") == issuer)
        check("pkce_s256", "S256" in auth.get("code_challenge_methods_supported", []))
        check("public_client_auth", "none" in auth.get("token_endpoint_auth_methods_supported", []))
        check("cimd_published", auth.get("client_id_metadata_document_supported") is True)
        scopes = auth.get("scopes_supported", [])
        check("issuer_scopes", {"hetu:read", "hetu:write"}.issubset(scopes), scopes)
        response = client.post(
            resource_url,
            headers={"accept": "application/json, text/event-stream"},
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
        )
        challenge = response.headers.get("www-authenticate", "")
        check("anonymous_access_rejected", response.status_code == 401, response.status_code)
        check("oauth_challenge", "Bearer" in challenge and metadata_url in challenge)
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        check("public_checks_completed", False, type(exc).__name__)
    return {
        "ready": all(c["passed"] for c in checks),
        "checks": checks,
        "verification_scope": "public_discovery_only",
        "next": (
            "Connect the real account in ChatGPT and verify save, app retrieval, and reconnect."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resource-url", required=True)
    parser.add_argument("--issuer", required=True)
    args = parser.parse_args()
    with httpx.Client(timeout=20) as client:
        result = check_connection(client, args.resource_url, args.issuer)
    print(json.dumps(result, indent=2))
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
