"""Local desktop model connection and nonblocking learning-cycle control."""

from __future__ import annotations

import asyncio
import ipaddress
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.core.config import get_settings
from app.db.session import get_session_factory
from app.services.local_models import LocalModelConfig, discover_local_models
from app.services.memory_learning_engine import (
    EngineConfig,
    get_engine_config,
    get_engine_state,
    list_engine_actions,
    prepare_engine_activity,
    run_engine_cycle,
    update_engine_config,
)

logger = logging.getLogger(__name__)
_tasks: dict[str, asyncio.Task] = {}
_model_slot = asyncio.Semaphore(1)


async def require_local_workspace(request: Request, settings: SettingsDep) -> None:
    host = request.client.host if request.client else ""
    try:
        loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = False
    if not (
        settings.environment == "local"
        and settings.sqlalchemy_database_url.startswith("sqlite")
        and loopback
    ):
        raise HTTPException(
            403, "Local learning is available only in HETU's local desktop workspace."
        )


async def stop_learning_tasks() -> None:
    tasks = list(_tasks.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    _tasks.clear()


@asynccontextmanager
async def _lifespan(_app):
    try:
        yield
    finally:
        await stop_learning_tasks()


router = APIRouter(dependencies=[Depends(require_local_workspace)], lifespan=_lifespan)


async def _work(owner_id: str, force: bool) -> None:
    try:
        # No database session is held while waiting for the local GPU.
        async with _model_slot:
            await run_engine_cycle(
                get_session_factory(),
                owner_id=owner_id,
                force=force,
                app_url=get_settings().app_url,
            )
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Local learning task failed")
    finally:
        _tasks.pop(owner_id, None)


def _queue(owner_id: str, *, force: bool = False) -> None:
    if owner_id not in _tasks:
        _tasks[owner_id] = asyncio.create_task(_work(owner_id, force))


def _with_task_state(owner_id: str, state: dict) -> dict:
    if owner_id in _tasks and state["state"] != "disabled":
        return {**state, "state": "running", "message": "Checking saved learning locally…"}
    return state


@router.get("/config")
async def config(identity: CurrentUser, db: DbDep) -> dict:
    return (await get_engine_config(db, owner_id=identity.user_id)).model_dump()


@router.put("/config")
async def save_config(payload: EngineConfig, identity: CurrentUser, db: DbDep) -> dict:
    if payload.enabled:
        discovery = await discover_local_models(
            LocalModelConfig(
                provider=payload.provider,
                base_url=payload.base_url,
                model=payload.model or None,
                timeout_seconds=10,
            )
        )
        if not discovery.selected_model_available:
            raise HTTPException(422, discovery.message)
    result = await update_engine_config(db, owner_id=identity.user_id, config=payload)
    await db.commit()
    if payload.enabled:
        _queue(identity.user_id)
    return result


@router.post("/models")
async def models(payload: EngineConfig, identity: CurrentUser) -> dict:
    result = await discover_local_models(
        LocalModelConfig(
            provider=payload.provider,
            base_url=payload.base_url,
            model=payload.model or None,
            timeout_seconds=10,
        )
    )
    return {
        **result.model_dump(),
        "models": [{**model.model_dump(), "id": model.name} for model in result.models],
    }


@router.get("/status")
async def status(identity: CurrentUser, db: DbDep) -> dict:
    return _with_task_state(identity.user_id, await get_engine_state(db, owner_id=identity.user_id))


@router.get("/actions")
async def actions(identity: CurrentUser, db: DbDep) -> dict:
    return await list_engine_actions(db, owner_id=identity.user_id)


@router.post("/actions/{entry_id}/prepare")
async def prepare_activity(entry_id: str, identity: CurrentUser, db: DbDep) -> dict:
    result = await prepare_engine_activity(db, owner_id=identity.user_id, entry_id=entry_id)
    await db.commit()
    return result


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    force: bool = False


@router.post("/run")
async def run(payload: RunRequest, identity: CurrentUser, db: DbDep) -> dict:
    config = await get_engine_config(db, owner_id=identity.user_id)
    state = await get_engine_state(db, owner_id=identity.user_id)
    if config.enabled:
        _queue(identity.user_id, force=payload.force)
    return _with_task_state(identity.user_id, state)
