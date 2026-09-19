from pydantic import SecretStr

from app.core.config import Settings


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
    settings = Settings(environment="production")
    try:
        settings.validate_runtime()
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("production configuration unexpectedly passed")
    assert "DATABASE_URL" in message
    assert "Upstash" in message
    assert "R2" in message
