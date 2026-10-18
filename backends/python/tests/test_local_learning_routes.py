import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.api.routes import local_learning_engine as routes
from app.core.config import Settings, get_settings
from app.core.security import Identity
from app.db.models import User
from app.db.session import get_db
from app.services.local_models import LocalModelDiscovery, LocalModelInfo
from app.services.records import require_collection


def test_private_engine_state_is_not_a_generic_collection():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as error:
        require_collection("memory_learning_engine")
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_local_connection_contract_and_owner_scope(db, monkeypatch):
    db.add_all([User(id="owner"), User(id="other")])
    await db.commit()
    app = FastAPI()
    app.include_router(routes.router, prefix="/engine")

    async def database():
        yield db

    async def identity():
        return Identity(user_id="owner")

    settings = Settings(environment="local", database_url="sqlite+aiosqlite://")
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = identity
    app.dependency_overrides[get_settings] = lambda: settings

    async def discover(config):
        return LocalModelDiscovery(
            provider=config.provider,
            base_url=config.base_url,
            reachable=True,
            models=[LocalModelInfo(name="qwen3:8b")],
            selected_model=config.model,
            selected_model_available=config.model == "qwen3:8b",
            message="Local model available.",
        )

    queued = []
    monkeypatch.setattr(routes, "discover_local_models", discover)
    monkeypatch.setattr(routes, "_queue", lambda owner, **kwargs: queued.append(owner))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1") as client:
        config = (await client.get("/engine/config")).json()
        assert config["enabled"] is False and config["model"] == ""
        config.update(enabled=True, model="qwen3:8b")
        models = await client.post("/engine/models", json=config)
        assert models.json()["models"][0]["id"] == "qwen3:8b"
        response = await client.put("/engine/config", json=config)
        assert response.status_code == 200 and queued == ["owner"]
        assert (await client.post("/engine/run", json={})).status_code == 200
        assert queued == ["owner", "owner"]

        async def other():
            return Identity(user_id="other")

        app.dependency_overrides[get_current_user] = other
        assert (await client.get("/engine/config")).json()["enabled"] is False
        assert (await client.get("/engine/actions")).json()["items"] == []
        config.update(base_url="https://cloud.example", enabled=False)
        assert (await client.put("/engine/config", json=config)).status_code == 422
        settings.environment = "production"
        assert (await client.get("/engine/status")).status_code == 403
