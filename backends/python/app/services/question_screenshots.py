"""Persist question-only ChatGPT files in Hetu's existing inline image format."""

from __future__ import annotations

import asyncio
import base64
import io
import warnings
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import Field, field_validator, model_validator

from app.services.learning_library import StrictModel

MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_BYTES = 650 * 1024


class OpenAIFile(StrictModel):
    download_url: str = Field(min_length=1, max_length=10000)
    file_id: str = Field(min_length=1, max_length=300)
    mime_type: str = Field(default="", max_length=100)
    file_name: str = Field(default="", max_length=500)

    @field_validator("download_url")
    @classmethod
    def trusted_download(cls, value: str) -> str:
        url = urlsplit(value)
        host = (url.hostname or "").lower()
        trusted = any(
            host == domain or host.endswith(f".{domain}")
            for domain in ("oaiusercontent.com", "chatgptusercontent.com", "openai.com")
        )
        if (
            url.scheme != "https"
            or not trusted
            or url.port not in {None, 443}
            or url.username
            or url.password
        ):
            raise ValueError("Use the temporary HTTPS file URL supplied by ChatGPT")
        return value


class QuestionCrop(StrictModel):
    """A normalized rectangle in the orientation-corrected screenshot."""

    x: float = Field(ge=0, lt=1, allow_inf_nan=False)
    y: float = Field(ge=0, lt=1, allow_inf_nan=False)
    width: float = Field(gt=0, le=1, allow_inf_nan=False)
    height: float = Field(gt=0, le=1, allow_inf_nan=False)

    @model_validator(mode="after")
    def within_image(self) -> QuestionCrop:
        if self.x + self.width > 1 or self.y + self.height > 1:
            raise ValueError("The crop must stay inside the screenshot")
        return self


async def download_screenshot(file: OpenAIFile) -> bytes:
    if file.mime_type and file.mime_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(415, "Question screenshots must be PNG, JPEG or WebP")
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False, trust_env=False) as client:
            async with client.stream("GET", file.download_url) as response:
                if response.status_code != 200:
                    raise HTTPException(
                        422, "Screenshot is unavailable; retry a fresh ChatGPT file"
                    )
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_DOWNLOAD_BYTES:
                        raise HTTPException(413, "Screenshot exceeds the 10 MiB download limit")
                return bytes(content)
    except httpx.HTTPError:
        raise HTTPException(422, "Screenshot download failed; retry a fresh ChatGPT file") from None


def question_image(data: bytes, crop: QuestionCrop | None, question_only: bool) -> str:
    if crop is None and not question_only:
        raise HTTPException(422, "Supply a question-only crop or confirm the image has no solution")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if (
                    source.format not in {"PNG", "JPEG", "WEBP"}
                    or source.width * source.height > 20_000_000
                ):
                    raise HTTPException(415, "Use a readable screenshot under 20 megapixels")
                image = ImageOps.exif_transpose(source)
                if crop:
                    rectangle = (
                        round(crop.x * image.width),
                        round(crop.y * image.height),
                        round((crop.x + crop.width) * image.width),
                        round((crop.y + crop.height) * image.height),
                    )
                    if rectangle[2] <= rectangle[0] or rectangle[3] <= rectangle[1]:
                        raise HTTPException(422, "Question crop is empty")
                    image = image.crop(rectangle)
                image = image.convert("RGB")
                image.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
                encoded = io.BytesIO()
                image.save(encoded, format="JPEG", quality=85, optimize=True)
                if len(encoded.getvalue()) > MAX_IMAGE_BYTES:
                    raise HTTPException(413, "Question image is too large; crop more tightly")
                return "data:image/jpeg;base64," + base64.b64encode(encoded.getvalue()).decode(
                    "ascii"
                )
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise HTTPException(415, "Screenshot is not a supported readable image") from None


async def prepare_question_image(
    file: OpenAIFile, crop: QuestionCrop | None, question_only: bool
) -> str:
    return await asyncio.to_thread(
        question_image, await download_screenshot(file), crop, question_only
    )
