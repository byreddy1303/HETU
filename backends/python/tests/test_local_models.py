import httpx
import pytest
from pydantic import BaseModel, ValidationError

from app.services import local_models as runtime


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com",
        "http://192.168.1.5:1234",
        "http://0.0.0.0:11434",
        "http://localhost.evil.test",
        "http://user:pass@127.0.0.1:11434",
        "http://127.0.0.1:11434?key=secret",
        "file:///tmp/model",
        "http://127.0.0.1/api",
    ],
)
def test_remote_or_ambiguous_urls_are_rejected(url):
    with pytest.raises(ValidationError):
        runtime.LocalModelConfig(base_url=url)


def test_loopback_normalization_and_cloud_rejection():
    assert (
        runtime.LocalModelConfig(base_url="http://localhost:11434/").base_url
        == "http://127.0.0.1:11434"
    )
    assert runtime.LocalModelConfig(base_url="http://[::1]:11434").base_url == "http://[::1]:11434"
    assert runtime.LocalModelConfig(
        provider="openai_compatible", base_url="http://localhost:1234/v1"
    ).base_url.endswith("/v1")
    with pytest.raises(ValidationError):
        runtime.LocalModelConfig(model="qwen3:8b-cloud")


def mock_server(monkeypatch, handler):
    monkeypatch.setattr(
        runtime,
        "_client",
        lambda config: httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
            base_url=config.base_url,
        ),
    )


@pytest.mark.asyncio
async def test_discovery_excludes_remote_and_embedding_models(monkeypatch):
    mock_server(
        monkeypatch,
        lambda request: httpx.Response(
            200,
            json={
                "models": [
                    {"name": "qwen3:8b", "capabilities": ["completion"]},
                    {"name": "nomic-embed-text", "capabilities": ["embedding"]},
                    {"name": "remote", "remote_host": "https://ollama.com"},
                    {"name": "gpt:cloud"},
                ]
            },
        ),
    )
    found = await runtime.discover_local_models(runtime.LocalModelConfig(model="qwen3:8b"))
    assert found.reachable and found.selected_model_available
    assert [model.name for model in found.models] == ["qwen3:8b"]


class Result(BaseModel):
    answer: int


@pytest.mark.asyncio
async def test_generation_is_structured_local_and_validated(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"models": [{"name": "qwen3:8b"}]})
        return httpx.Response(
            200, json={"done": True, "done_reason": "stop", "message": {"content": '{"answer": 6}'}}
        )

    mock_server(monkeypatch, handler)
    result = await runtime.generate_local_json(
        runtime.LocalModelConfig(model="qwen3:8b"),
        system="Read the evidence",
        evidence={"submitted": "2"},
        schema=Result,
    )
    assert result.answer == 6
    assert len(requests) == 2 and all(request.url.host == "127.0.0.1" for request in requests)
    import json

    payload = json.loads(requests[-1].content)
    assert payload["format"] == Result.model_json_schema()
    assert payload["think"] is False and payload["stream"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind,code",
    [
        ("redirect", "redirect_blocked"),
        ("invalid", "invalid_output"),
        ("truncated", "incomplete_output"),
        ("offline", "unavailable"),
    ],
)
async def test_model_failures_do_not_produce_fallback_diagnoses(monkeypatch, kind, code):
    def handler(request):
        if kind == "offline":
            raise httpx.ConnectError("offline", request=request)
        if request.method == "GET":
            return httpx.Response(200, json={"models": [{"name": "qwen3:8b"}]})
        if kind == "redirect":
            return httpx.Response(302, headers={"location": "https://cloud.example/model"})
        return httpx.Response(
            200,
            json={
                "done": True,
                "done_reason": "length" if kind == "truncated" else "stop",
                "message": {"content": '{"answer":"not a number"}'},
            },
        )

    mock_server(monkeypatch, handler)
    with pytest.raises(runtime.LocalModelError) as error:
        await runtime.generate_local_json(
            runtime.LocalModelConfig(model="qwen3:8b"), system="test", evidence={}, schema=Result
        )
    assert error.value.code == code


@pytest.mark.asyncio
async def test_openai_compatible_local_server_uses_v1_and_json_schema(monkeypatch):
    import json

    def handler(request):
        if request.method == "GET":
            assert request.url.path == "/v1/models"
            return httpx.Response(200, json={"data": [{"id": "local-model"}]})
        assert request.url.host == "127.0.0.1" and request.url.path == "/v1/chat/completions"
        assert json.loads(request.content)["response_format"]["type"] == "json_schema"
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"answer":6}'}, "finish_reason": "stop"}]},
        )

    mock_server(monkeypatch, handler)
    config = runtime.LocalModelConfig(
        provider="openai_compatible", base_url="http://localhost:1234/v1", model="local-model"
    )
    result = await runtime.generate_local_json(
        config, system="Read evidence", evidence={}, schema=Result
    )
    assert result.answer == 6
