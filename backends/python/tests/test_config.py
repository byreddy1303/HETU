import pytest
from pydantic import SecretStr

from app.core.config import Settings


@pytest.mark.parametrize(
    ("vercel_environment", "expected_environment", "expected_maintenance"),
    [
        ("production", "production", True),
        ("preview", "staging", True),
        ("development", "local", False),
    ],
)
def test_vercel_defaults_keep_hosted_deployments_closed(
    monkeypatch, vercel_environment, expected_environment, expected_maintenance
) -> None:
    monkeypatch.setenv("VERCEL_ENV", vercel_environment)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("MAINTENANCE_MODE", raising=False)
    settings = Settings(_env_file=None)
    assert settings.environment == expected_environment
    assert settings.maintenance_mode is expected_maintenance


def test_preview_can_explicitly_enable_staging(monkeypatch) -> None:
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("MAINTENANCE_MODE", "false")
    settings = Settings(_env_file=None)
    assert settings.environment == "staging"
    assert settings.maintenance_mode is False


def test_neon_url_is_normalized_for_asyncpg() -> None:
    settings = Settings(
        database_url=SecretStr(
            "postgresql://user:pass@example.neon.tech/db?sslmode=require&channel_binding=require"
        )
    )
    assert settings.sqlalchemy_database_url == (
        "postgresql+asyncpg://user:pass@example.neon.tech/db?ssl=require"
    )


def test_production_requires_external_services() -> None:
    settings = Settings(environment="production", database_url=SecretStr("sqlite+aiosqlite://"))
    try:
        settings.validate_runtime()
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("production configuration unexpectedly passed")
    assert "DATABASE_URL" in message
    assert "Upstash" in message
    assert "R2" in message
