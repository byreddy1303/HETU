import base64
import json
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import func, select
from svix.webhooks import Webhook

from app.core.config import get_settings
from app.db.models import BackgroundJob, Record, User, WebhookReceipt
from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_deleted_identity_is_not_purged_or_resurrected_by_replayed_webhook(db, monkeypatch):
    secret = "whsec_" + base64.b64encode(b"test-signing-key-not-for-production").decode()
    monkeypatch.setattr(get_settings(), "clerk_webhook_secret", SecretStr(secret))
    db.add(User(id="user_keep", email="keep@example.com"))
    await db.flush()
    db.add(
        Record(
            collection="questions",
            owner_id="user_keep",
            external_id="q1",
            data={"answer": "retained"},
        )
    )
    await db.commit()

    async def database():
        yield db

    def signed(event_id, event_type):
        body = json.dumps({"type": event_type, "data": {"id": "user_keep"}})
        now = datetime.now(UTC)
        return body, {
            "svix-id": event_id,
            "svix-timestamp": str(int(now.timestamp())),
            "svix-signature": Webhook(secret).sign(event_id, now, body),
            "Content-Type": "application/json",
        }

    app.dependency_overrides[get_db] = database
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            body, headers = signed("evt-delete", "user.deleted")
            for _ in range(2):
                response = await client.post("/v1/webhooks/clerk", content=body, headers=headers)
                assert response.status_code == 204
            body, headers = signed("evt-late-update", "user.updated")
            response = await client.post("/v1/webhooks/clerk", content=body, headers=headers)
            assert response.status_code == 204
            assert (await db.get(User, "user_keep")).deleted_at is not None
            assert (await db.get(User, "user_keep")).email == "keep@example.com"
            assert await db.scalar(select(func.count()).select_from(Record)) == 1
            assert await db.scalar(select(func.count()).select_from(BackgroundJob)) == 0
            assert await db.scalar(select(func.count()).select_from(WebhookReceipt)) == 2
            response = await client.post(
                "/v1/webhooks/clerk", content=body, headers={**headers, "svix-signature": "invalid"}
            )
            assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()
