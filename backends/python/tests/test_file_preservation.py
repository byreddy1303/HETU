from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.routes.files import complete_upload, remove_file, restore_file
from app.core.security import Identity
from app.db.models import FileObject, User


@pytest.mark.asyncio
async def test_file_delete_and_restore_keep_object_bytes(db, monkeypatch):
    db.add(User(id="owner"))
    await db.flush()
    file = FileObject(
        id="f1",
        owner_id="owner",
        object_key="users/owner/unique.png",
        original_name="image.png",
        content_type="image/png",
        size_bytes=10,
        etag="original",
        status="ready",
    )
    db.add(file)
    await db.commit()
    delete = AsyncMock()
    monkeypatch.setattr("app.services.storage.delete_object", delete)
    monkeypatch.setattr(
        "app.api.routes.files.head_object",
        AsyncMock(
            return_value={"ContentLength": 10, "ETag": '"original"', "ContentType": "image/png"}
        ),
    )
    monkeypatch.setattr("app.api.routes.files.presign_download", AsyncMock(return_value="signed"))
    await remove_file("f1", Identity(user_id="owner"), db)
    assert file.status == "deleted"
    delete.assert_not_awaited()
    with pytest.raises(HTTPException) as exc:
        await complete_upload("f1", Identity(user_id="owner"), db)
    assert exc.value.status_code == 409
    response = await restore_file("f1", Identity(user_id="owner"), db)
    assert response.status == "ready"
    assert file.object_key == "users/owner/unique.png"
    delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_upload_signature_requires_create_only(monkeypatch):
    from unittest.mock import Mock

    from app.services.storage import presign_upload

    client = Mock()
    client.generate_presigned_url.return_value = "signed"
    monkeypatch.setattr("app.services.storage.get_r2_client", lambda: client)
    assert await presign_upload("key", "image/png") == "signed"
    assert client.generate_presigned_url.call_args.kwargs["Params"]["IfNoneMatch"] == "*"
