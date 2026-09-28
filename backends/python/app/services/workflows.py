"""Durable, user-facing task briefs for resumable multi-section work."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Record
from app.services.learning_library import fingerprint, stable_id
from app.services.records import lock_identity, to_api, upsert_records


class BriefStart(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    idempotency_key: str = Field(min_length=8, max_length=128)
    goal: str = Field(min_length=1, max_length=4000)
    constraints: list[str] = Field(default_factory=list, max_length=30)
    assumptions: list[str] = Field(default_factory=list, max_length=20)
    references: list[str] = Field(default_factory=list, max_length=40)
    pending_steps: list[str] = Field(default_factory=list, max_length=40)
    success_criteria: list[str] = Field(default_factory=list, max_length=20)


class BriefUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    expected_version: int = Field(ge=1)
    operation_id: str = Field(min_length=8, max_length=128)
    correction: str | None = Field(default=None, max_length=4000)
    completed_step: str | None = Field(default=None, max_length=1000)
    pending_step: str | None = Field(default=None, max_length=1000)
    remove_pending_step: str | None = Field(default=None, max_length=1000)
    assumption: str | None = Field(default=None, max_length=1000)
    reference: str | None = Field(default=None, max_length=1000)
    receipt: dict[str, Any] | None = None
    status: Literal["active", "waiting", "complete", "cancelled"] | None = None

    @model_validator(mode="after")
    def require_effect(self) -> BriefUpdate:
        if not (self.model_fields_set - {"expected_version", "operation_id"}):
            raise ValueError("Specify a brief change")
        return self


async def _brief(db: AsyncSession, owner_id: str, workflow_id: str) -> Record:
    row = await db.scalar(
        select(Record).where(
            Record.collection == "workflow_records",
            Record.owner_id == owner_id,
            Record.external_id == workflow_id,
            Record.deleted_at.is_(None),
        )
    )
    if row is None:
        raise HTTPException(404, "Workflow not found")
    return row


async def start_workflow(
    db: AsyncSession, *, owner_id: str, start: BriefStart, app_url: str
) -> dict[str, Any]:
    workflow_id = stable_id("workflow", start.idempotency_key)
    await lock_identity(db, "workflow_records", owner_id, workflow_id)
    source_hash = fingerprint(start.model_dump(exclude={"idempotency_key"}))
    existing = await db.scalar(
        select(Record).where(
            Record.collection == "workflow_records",
            Record.owner_id == owner_id,
            Record.external_id == workflow_id,
        )
    )
    if existing:
        if existing.data.get("source_hash") != source_hash:
            raise HTTPException(409, "Workflow idempotency key was reused for another goal")
        return {**to_api(existing), "idempotent_replay": True}
    now = datetime.now(UTC).isoformat()
    row = (
        await upsert_records(
            db,
            collection="workflow_records",
            owner_id=owner_id,
            items=[
                {
                    "id": workflow_id,
                    "goal": start.goal,
                    "constraints": start.constraints,
                    "assumptions": start.assumptions,
                    "references": start.references,
                    "pending_steps": start.pending_steps,
                    "success_criteria": start.success_criteria,
                    "corrections": [],
                    "completed_steps": [],
                    "receipts": [],
                    "applied_operations": {},
                    "status": "active",
                    "source_hash": source_hash,
                    "started_at": now,
                    "url": f"{app_url.rstrip('/')}/workflows/{workflow_id}",
                }
            ],
        )
    )[0]
    return {**to_api(row), "idempotent_replay": False}


async def update_workflow(
    db: AsyncSession, *, owner_id: str, workflow_id: str, update: BriefUpdate
) -> dict[str, Any]:
    await lock_identity(db, "workflow_records", owner_id, workflow_id)
    row = await _brief(db, owner_id, workflow_id)
    operations = dict(row.data.get("applied_operations", {}))
    change_hash = fingerprint(update.model_dump(exclude={"expected_version", "operation_id"}))
    previous_hash = operations.get(update.operation_id)
    if previous_hash:
        if previous_hash != change_hash:
            raise HTTPException(409, "Operation ID was reused for different changes")
        return {**to_api(row), "idempotent_replay": True}
    if row.version != update.expected_version:
        raise HTTPException(409, {"message": "Version conflict", "current_version": row.version})
    data = dict(row.data)
    for source, target in (
        ("correction", "corrections"),
        ("completed_step", "completed_steps"),
        ("pending_step", "pending_steps"),
        ("assumption", "assumptions"),
        ("reference", "references"),
    ):
        value = getattr(update, source)
        if value and value not in data[target]:
            data[target] = [*data[target], value]
    if update.remove_pending_step:
        data["pending_steps"] = [
            step for step in data["pending_steps"] if step != update.remove_pending_step
        ]
    if update.receipt is not None:
        encoded = fingerprint(update.receipt)
        if len(str(update.receipt).encode()) > 30000:
            raise HTTPException(413, "Workflow receipt is too large")
        data["receipts"] = [
            *data["receipts"],
            {
                "operation_id": update.operation_id,
                "recorded_at": datetime.now(UTC).isoformat(),
                "content_hash": encoded,
                "result": update.receipt,
            },
        ]
    if update.status:
        data["status"] = update.status
    operations[update.operation_id] = change_hash
    data["applied_operations"] = operations
    data["updated_reason"] = "Workflow progress or user correction"
    saved = (
        await upsert_records(
            db,
            collection="workflow_records",
            owner_id=owner_id,
            items=[{"id": workflow_id, "expected_version": row.version, **data}],
        )
    )[0]
    return {**to_api(saved), "idempotent_replay": False}


async def get_workflow(db: AsyncSession, *, owner_id: str, workflow_id: str) -> dict[str, Any]:
    return to_api(await _brief(db, owner_id, workflow_id))


async def list_workflows(
    db: AsyncSession, *, owner_id: str, limit: int = 20
) -> list[dict[str, Any]]:
    rows = (
        await db.scalars(
            select(Record)
            .where(
                Record.collection == "workflow_records",
                Record.owner_id == owner_id,
                Record.deleted_at.is_(None),
            )
            .order_by(Record.updated_at.desc())
            .limit(limit)
        )
    ).all()
    return [to_api(row) for row in rows]
