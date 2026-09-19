from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UserResponse(StrictModel):
    id: str
    email: str | None = None
    username: str | None = None
    display_name: str | None = None
    profile: dict[str, Any] = Field(default_factory=dict)


class UserUpdate(StrictModel):
    display_name: str | None = Field(default=None, max_length=256)
    username: str | None = Field(default=None, min_length=2, max_length=128)
    profile: dict[str, Any] | None = None


class RecordUpsertItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = Field(default=None, max_length=128)
    expected_version: int | None = Field(default=None, ge=1)


class RecordBatchUpsert(StrictModel):
    items: list[RecordUpsertItem] = Field(min_length=1, max_length=100)


class RecordPatch(StrictModel):
    data: dict[str, Any]
    expected_version: int | None = Field(default=None, ge=1)


class QueryFilter(StrictModel):
    field: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
    op: Literal["eq", "neq", "in", "gt", "gte", "lt", "lte", "is"] = "eq"
    value: Any = None


class RecordQuery(StrictModel):
    filters: list[QueryFilter] = Field(default_factory=list, max_length=8)
    order_by: str = Field(default="updated_at", pattern=r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
    descending: bool = True
    limit: int = Field(default=200, ge=1, le=500)
    cursor: str | None = None


class RecordListResponse(StrictModel):
    items: list[dict[str, Any]]
    next_cursor: str | None = None


class UploadIntent(StrictModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)

    @field_validator("filename")
    @classmethod
    def safe_filename(cls, value: str) -> str:
        if value in {".", ".."} or "\x00" in value:
            raise ValueError("invalid filename")
        return value


class UploadIntentResponse(StrictModel):
    file_id: str
    method: Literal["PUT"] = "PUT"
    upload_url: str
    headers: dict[str, str]
    expires_in: int


class FileResponse(StrictModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int | None
    status: str
    url: str | None = None
    created_at: datetime


class JobCreate(StrictModel):
    kind: Literal["realtime-event", "delete-file", "noop"]
    payload: dict[str, Any] = Field(default_factory=dict)
    run_at: datetime | None = None
    idempotency_key: str | None = Field(default=None, max_length=255)


class JobResponse(StrictModel):
    id: str
    kind: str
    status: str
    attempts: int
    run_at: datetime
    finished_at: datetime | None
    last_error: str | None


class HealthResponse(StrictModel):
    status: Literal["ok", "degraded", "error"]
    version: str
    checks: dict[str, str] = Field(default_factory=dict)
