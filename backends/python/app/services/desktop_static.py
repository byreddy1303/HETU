"""Serve desktop assets without turning missing APIs into successful HTML responses."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from starlette.responses import FileResponse

_API_ROOTS = {"v1", "api", "mcp", "health", "metrics", "docs", "openapi.json", "__clerk"}


def desktop_static_router(directory: str) -> APIRouter:
    root = Path(directory).resolve()
    router = APIRouter()

    @router.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        path = Path(full_path)
        if (
            path.is_absolute()
            or any(part.startswith(".") for part in path.parts)
            or (path.parts and path.parts[0] in _API_ROOTS)
        ):
            raise HTTPException(status_code=404, detail="Not found")
        target = (root / path).resolve()
        if not target.is_relative_to(root):
            raise HTTPException(status_code=404, detail="Not found")
        if target.is_file():
            return FileResponse(target)
        # A missing asset needs a real 404 so scripts/images cannot silently
        # consume index.html. Only extension-free client routes use the SPA.
        if path.suffix or (path.parts and path.parts[0] == "assets"):
            raise HTTPException(status_code=404, detail="Not found")
        index = root / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=503, detail="Desktop assets have not been built")
        return FileResponse(index)

    return router
