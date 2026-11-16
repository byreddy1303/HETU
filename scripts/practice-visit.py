#!/usr/bin/env python3
"""Review and refresh the installed LOCAL mistake queue at a HETU chat visit.

No credentials, hosted connector, model download or external requests are used.
Author uncovered packs through the validated local /authored-packs endpoint.
"""
import argparse
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8765"


def request(path, body=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    # Local traffic must stay local even when proxy environment variables exist.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=60) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument("--include-context", action="store_true")
    args = parser.parse_args()
    health = request("/health/ready")
    if health.get("checks", {}).get("storage") != "local":
        raise RuntimeError("The installed API is not a verified local workspace")
    before = request("/v1/practice-coach")
    prepared = None if args.inspect_only else request("/v1/practice-coach/prepare", {})
    after = before if args.inspect_only else request("/v1/practice-coach")
    result = {
        "storage": "local",
        "complete_history": after["complete"],
        "created_packs": len(prepared["created"]) if prepared else 0,
        "retained_packs": len(prepared["retained"]) if prepared else len(after["packs"]),
        "due_packs": sum(p["due"] for p in after["packs"]),
        "groups": [
            {k: g[k] for k in ("id", "title", "basis", "family", "source_ids")}
            for g in after["groups"]
        ],
        "needs_authored_exercises": prepared["uncovered"] if prepared else [],
    }
    if args.include_context:
        result["context"] = before["groups"]
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print(json.dumps({"error": error.code, "detail": error.read().decode()[:1000]}))
        raise SystemExit(1)
    except (OSError, RuntimeError) as error:
        print(json.dumps({"error": str(error)}))
        raise SystemExit(1)
