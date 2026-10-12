from __future__ import annotations

import base64
import io

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from mcp.server.auth.provider import AccessToken
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.models import Record, User, UserIdentity
from app.mcp_server import ClerkOAuthVerifier, create_mcp_server
from app.services import recovery
from app.services.question_screenshots import OpenAIFile, QuestionCrop, question_image


def screenshot() -> bytes:
    image = Image.new("RGB", (300, 400), "white")
    image.paste("red", (0, 200, 300, 400))  # Answer panel must be removed.
    output = io.BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def test_crop_retains_question_and_excludes_answer_pixels():
    encoded = question_image(screenshot(), QuestionCrop(x=0, y=0, width=1, height=0.5), False)
    with Image.open(io.BytesIO(base64.b64decode(encoded.split(",")[1]))) as image:
        assert image.size == (300, 200)
        assert image.getpixel((150, 150)) == (255, 255, 255)
    with pytest.raises(HTTPException):
        question_image(screenshot(), None, False)
    with pytest.raises(HTTPException):
        question_image(b"not an image", None, True)


@pytest.mark.parametrize(
    "url",
    [
        "http://files.oaiusercontent.com/image",
        "https://127.0.0.1/image",
        "https://files.oaiusercontent.com.evil.test/image",
        "https://user:secret@openai.com/image",
    ],
)
def test_file_downloads_require_trusted_https_urls(url):
    with pytest.raises(ValidationError):
        OpenAIFile(download_url=url, file_id="file-image")


@pytest.mark.asyncio
async def test_authenticated_mcp_file_input_crops_and_queues_even_correct_questions(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        db.add_all([User(id="owner-a"), User(id="owner-b")])
        db.add_all(
            [
                UserIdentity(user_id="owner-a", provider="clerk", subject="user_a"),
                UserIdentity(user_id="owner-b", provider="clerk", subject="user_b"),
            ]
        )
        await db.commit()
    settings = Settings(
        environment="test",
        mcp_resource_url="http://testserver/mcp",
        clerk_oauth_issuer="https://clerk.example.test",
        app_url="https://hetu.test",
        mcp_allowed_client_ids="https://chatgpt.com/oauth/client.json",
    )

    async def verify(self, token):
        return AccessToken(
            token=token,
            client_id="https://chatgpt.com/oauth/client.json",
            scopes=["hetu:read"] if token == "read" else ["hetu:read", "hetu:write"],
            subject="user_b" if token == "other" else "user_a",
            resource=settings.mcp_resource_url,
        )

    calls = []

    async def download(file):
        calls.append(file.file_id)
        return screenshot()

    monkeypatch.setattr(ClerkOAuthVerifier, "verify_token", verify)
    monkeypatch.setattr("app.mcp_server.get_session_factory", lambda: factory)
    monkeypatch.setattr("app.mcp_test_tools.get_session_factory", lambda: factory)
    monkeypatch.setattr("app.services.test_analysis.download_screenshot", download)
    server = create_mcp_server(settings)
    transport = server.streamable_http_app(
        stateless_http=True, json_response=True, host="testserver"
    )
    draft = {
        "idempotency_key": "mcp-question-image-test",
        "test_key": "correct-question-test",
        "name": "Cache test",
        "test_date": "2026-10-10",
        "summary": "Retain cache questions for repeat practice.",
        "full_analysis": "Keep the question image separate from the answer.",
        "sources": [{"kind": "conversation", "title": "Cache question screenshot"}],
        "questions": [
            {
                "ref": "Q1",
                "subject": "COA",
                "question_text": "Offset bits for 64 bytes?",
                "answer_text": "6",
                "outcome": "R",
                "outcome_provenance": "screenshot",
                "screenshot_index": 0,
                "question_crop": {"x": 0, "y": 0, "width": 1, "height": 0.5},
            }
        ],
    }
    arguments = {
        "draft": draft,
        "screenshots": [
            {
                "file_id": "file-test-1",
                "download_url": "https://files.oaiusercontent.com/test?signature=private",
            }
        ],
    }
    try:
        async with server.session_manager.run():
            async with AsyncClient(
                transport=ASGITransport(app=transport), base_url="http://testserver"
            ) as client:
                sequence = 0

                async def rpc(method, params, token="write"):
                    nonlocal sequence
                    sequence += 1
                    response = await client.post(
                        "/mcp",
                        headers={
                            "authorization": f"Bearer {token}",
                            "accept": "application/json, text/event-stream",
                        },
                        json={"jsonrpc": "2.0", "id": sequence, "method": method, "params": params},
                    )
                    assert response.status_code == 200, response.text
                    return response.json()["result"]

                listed = await rpc("tools/list", {})
                descriptor = next(t for t in listed["tools"] if t["name"] == "save_test_analysis")
                assert descriptor["_meta"]["openai/fileParams"] == ["screenshots"]
                file_schema = descriptor["inputSchema"]["$defs"]["OpenAIFile"]
                assert set(file_schema["properties"]) == {
                    "download_url",
                    "file_id",
                    "mime_type",
                    "file_name",
                }
                assert set(file_schema["required"]) == {"download_url", "file_id"}
                assert "screenshots" not in descriptor["inputSchema"]["required"]
                denied = await rpc(
                    "tools/call", {"name": "save_test_analysis", "arguments": arguments}, "read"
                )
                assert denied["isError"] and calls == []
                saved = await rpc(
                    "tools/call", {"name": "save_test_analysis", "arguments": arguments}
                )
                assert not saved.get("isError"), saved
                receipt = saved["structuredContent"]
                assert receipt["artifact_counts"]["reattempts"] == 1
                detail = await rpc(
                    "tools/call",
                    {
                        "name": "get_test_analysis",
                        "arguments": {"test_analysis_id": receipt["test_analysis_id"]},
                    },
                )
                assert not detail.get("isError"), detail
                question_detail = detail["structuredContent"]["artifacts"]["questions"][0]
                assert question_detail["has_image"] is True
                assert "image_url" not in question_detail
                assert detail["structuredContent"]["artifacts"]["reattempts"][0]["practice_only"]
                assert calls == ["file-test-1"]
                retry_args = {
                    **arguments,
                    "screenshots": [
                        {
                            **arguments["screenshots"][0],
                            "download_url": "https://files.oaiusercontent.com/test?signature=refreshed",
                        }
                    ],
                }
                replay = await rpc(
                    "tools/call", {"name": "save_test_analysis", "arguments": retry_args}
                )
                assert replay["structuredContent"]["idempotent_replay"] and len(calls) == 1
                text_only = await rpc(
                    "tools/call",
                    {
                        "name": "save_test_analysis",
                        "arguments": {
                            "draft": {
                                **draft,
                                "idempotency_key": "mcp-text-only-test",
                                "test_key": "text-only-test",
                                "questions": [
                                    {
                                        "ref": "Q1",
                                        "subject": "COA",
                                        "question_text": "Offset bits for 64 bytes?",
                                    }
                                ],
                            }
                        },
                    },
                )
                assert not text_only.get("isError"), text_only
                assert text_only["structuredContent"]["artifact_counts"]["reattempts"] == 1
                assert len(calls) == 1
                private = await rpc(
                    "tools/call",
                    {
                        "name": "get_test_analysis",
                        "arguments": {"test_analysis_id": receipt["test_analysis_id"]},
                    },
                    "other",
                )
                assert private["isError"]
                async with factory() as db:
                    question = await db.scalar(
                        select(Record).where(
                            Record.owner_id == "owner-a",
                            Record.collection == "questions",
                            Record.external_id == question_detail["id"],
                        )
                    )
                    assert question.data["image_question_only"] is True
                    assert "private" not in str(question.data)
                    with Image.open(
                        io.BytesIO(base64.b64decode(question.data["image_url"].split(",")[1]))
                    ) as image:
                        assert image.size == (300, 200)
                    item = await db.scalar(
                        select(Record).where(
                            Record.owner_id == "owner-a",
                            Record.collection == "learning_items",
                            Record.data["source_question_id"].as_string() == question_detail["id"],
                        )
                    )
                    prompt = await recovery.prompt_for(db, "owner-a", item)
                    assert prompt["answer_hidden"] and "answer_text" not in prompt["question"]
                    assert "learner_answer" not in prompt["question"]
                    assert prompt["question"]["image_url"] == question.data["image_url"]
    finally:
        await engine.dispose()
