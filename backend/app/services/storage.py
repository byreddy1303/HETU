from __future__ import annotations

import asyncio
import re
from functools import lru_cache
from pathlib import PurePath
from typing import Any
from uuid import uuid4

import boto3
from botocore.client import BaseClient
from fastapi import HTTPException

from app.core.config import get_settings

_UNSAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


@lru_cache
def get_r2_client() -> BaseClient:
    settings = get_settings()
    if not settings.r2_configured:
        raise RuntimeError("Cloudflare R2 is not configured")
    return boto3.client(
        service_name="s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id.get_secret_value(),
        aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
        region_name="auto",
    )


def object_key(user_id: str, filename: str) -> str:
    basename = PurePath(filename).name
    safe = _UNSAFE_NAME.sub("-", basename).strip(".-") or "upload"
    return f"users/{user_id}/{uuid4()}/{safe[:255]}"


async def presign_upload(key: str, content_type: str) -> str:
    settings = get_settings()
    client = get_r2_client()
    return await asyncio.to_thread(
        client.generate_presigned_url,
        "put_object",
        Params={"Bucket": settings.r2_bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=settings.upload_url_ttl_seconds,
    )


async def presign_download(key: str, filename: str) -> str:
    settings = get_settings()
    if settings.r2_public_base_url:
        return f"{settings.r2_public_base_url.rstrip('/')}/{key}"
    client = get_r2_client()
    disposition_name = PurePath(filename).name.replace('"', "")
    return await asyncio.to_thread(
        client.generate_presigned_url,
        "get_object",
        Params={
            "Bucket": settings.r2_bucket,
            "Key": key,
            "ResponseContentDisposition": f'attachment; filename="{disposition_name}"',
        },
        ExpiresIn=settings.download_url_ttl_seconds,
    )


async def head_object(key: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return await asyncio.to_thread(
            get_r2_client().head_object, Bucket=settings.r2_bucket, Key=key
        )
    except Exception as exc:
        raise HTTPException(
            status_code=409, detail="Upload is not present in object storage"
        ) from exc


async def delete_object(key: str) -> None:
    settings = get_settings()
    await asyncio.to_thread(get_r2_client().delete_object, Bucket=settings.r2_bucket, Key=key)
