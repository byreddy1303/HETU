from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.db.models import FileObject
from app.schemas import FileResponse, UploadIntent, UploadIntentResponse
from app.services.storage import (
    delete_object,
    head_object,
    object_key,
    presign_download,
    presign_upload,
)

router = APIRouter()


@router.post("/upload-intent", response_model=UploadIntentResponse, status_code=201)
async def create_upload_intent(
    payload: UploadIntent,
    identity: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> UploadIntentResponse:
    if not settings.r2_configured:
        raise HTTPException(status_code=503, detail="Object storage is not configured")
    if payload.content_type not in settings.allowed_content_types:
        raise HTTPException(status_code=415, detail="File type is not allowed")
    if payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds the upload size limit")

    file_id = str(uuid4())
    key = object_key(identity.user_id, payload.filename)
    file = FileObject(
        id=file_id,
        owner_id=identity.user_id,
        object_key=key,
        original_name=payload.filename,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
    )
    db.add(file)
    await db.commit()
    url = await presign_upload(key, payload.content_type)
    return UploadIntentResponse(
        file_id=file_id,
        upload_url=url,
        headers={"Content-Type": payload.content_type},
        expires_in=settings.upload_url_ttl_seconds,
    )


@router.post("/{file_id}/complete", response_model=FileResponse)
async def complete_upload(file_id: str, identity: CurrentUser, db: DbDep) -> FileResponse:
    file = await _owned_file(db, file_id, identity.user_id)
    metadata = await head_object(file.object_key)
    actual_size = int(metadata.get("ContentLength", 0))
    actual_type = metadata.get("ContentType")
    if file.size_bytes is not None and actual_size != file.size_bytes:
        await delete_object(file.object_key)
        raise HTTPException(status_code=409, detail="Uploaded file size does not match intent")
    if actual_type and actual_type != file.content_type:
        await delete_object(file.object_key)
        raise HTTPException(status_code=409, detail="Uploaded file type does not match intent")
    file.size_bytes = actual_size
    file.etag = str(metadata.get("ETag", "")).strip('"') or None
    file.status = "ready"
    await db.commit()
    return await _file_response(file)


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(file_id: str, identity: CurrentUser, db: DbDep) -> FileResponse:
    file = await _owned_file(db, file_id, identity.user_id)
    return await _file_response(file)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_file(file_id: str, identity: CurrentUser, db: DbDep) -> Response:
    file = await _owned_file(db, file_id, identity.user_id)
    if file.status != "deleted":
        await delete_object(file.object_key)
        file.status = "deleted"
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _owned_file(db: DbDep, file_id: str, owner_id: str) -> FileObject:
    file = await db.scalar(
        select(FileObject).where(FileObject.id == file_id, FileObject.owner_id == owner_id)
    )
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    return file


async def _file_response(file: FileObject) -> FileResponse:
    url = None
    if file.status == "ready":
        url = await presign_download(file.object_key, file.original_name)
    return FileResponse(
        id=file.id,
        filename=file.original_name,
        content_type=file.content_type,
        size_bytes=file.size_bytes,
        status=file.status,
        url=url,
        created_at=file.created_at,
    )
