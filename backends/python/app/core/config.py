from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "staging", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Hetu API"
    app_version: str = "1.0.0"
    environment: Environment = "local"
    debug: bool = False
    maintenance_mode: bool = False
    api_prefix: str = "/v1"

    database_url: SecretStr = SecretStr("sqlite+aiosqlite:///./hetu.db")
    database_pool_size: int = Field(default=5, ge=1, le=20)
    database_max_overflow: int = Field(default=5, ge=0, le=40)

    clerk_secret_key: SecretStr | None = None
    clerk_jwt_key: SecretStr | None = None
    clerk_webhook_secret: SecretStr | None = None
    clerk_authorized_parties: str = "http://localhost:5173"
    auth_token_secret: SecretStr | None = None
    owner_user_ids: str = ""
    owner_email: str | None = None
    app_url: str = "http://localhost:5173"

    resend_api_key: SecretStr | None = None
    mail_from: str | None = None
    telegram_bot_token: SecretStr | None = None
    telegram_webhook_secret: SecretStr | None = None
    vapid_public_key: str | None = None
    vapid_private_key: SecretStr | None = None
    vapid_subject: str | None = None
    fcm_service_account_json: SecretStr | None = None

    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    trusted_hosts: str = "localhost,127.0.0.1,testserver"

    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: SecretStr | None = None
    redis_events_channel: str = "hetu:events:v1"
    redis_jobs_key: str = "hetu:jobs:v1"
    rate_limit_requests: int = Field(default=120, ge=1, le=10000)
    rate_limit_window_seconds: int = Field(default=60, ge=1, le=3600)
    rate_limit_fail_open: bool = True

    r2_account_id: str | None = None
    r2_access_key_id: SecretStr | None = None
    r2_secret_access_key: SecretStr | None = None
    r2_bucket: str | None = None
    r2_public_base_url: str | None = None
    upload_url_ttl_seconds: int = Field(default=900, ge=60, le=3600)
    download_url_ttl_seconds: int = Field(default=900, ge=60, le=86400)
    max_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1)
    allowed_upload_content_types: str = (
        "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain"
    )

    sentry_dsn: SecretStr | None = None
    log_level: str = "INFO"
    worker_poll_seconds: float = Field(default=2.0, ge=0.25, le=60)
    worker_max_attempts: int = Field(default=5, ge=1, le=20)

    @field_validator("api_prefix")
    @classmethod
    def validate_api_prefix(cls, value: str) -> str:
        value = value.rstrip("/")
        if not value.startswith("/"):
            raise ValueError("api_prefix must begin with '/'")
        return value

    @property
    def sqlalchemy_database_url(self) -> str:
        """Return a Neon URL that SQLAlchemy's asyncpg dialect accepts."""
        raw = self.database_url.get_secret_value()
        if raw.startswith("postgres://"):
            raw = "postgresql://" + raw.removeprefix("postgres://")
        if raw.startswith("postgresql://"):
            raw = "postgresql+asyncpg://" + raw.removeprefix("postgresql://")
        if not raw.startswith("postgresql+asyncpg://"):
            return raw

        parts = urlsplit(raw)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        ssl_mode = query.pop("sslmode", None)
        query.pop("channel_binding", None)
        if ssl_mode and ssl_mode != "disable":
            query["ssl"] = "require"
        return urlunsplit(
            (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
        )

    @property
    def authorized_parties(self) -> list[str]:
        return _csv(self.clerk_authorized_parties)

    @property
    def owner_ids(self) -> set[str]:
        return set(_csv(self.owner_user_ids))

    @property
    def cors_origin_list(self) -> list[str]:
        return _csv(self.cors_origins)

    @property
    def trusted_host_list(self) -> list[str]:
        return _csv(self.trusted_hosts)

    @property
    def allowed_content_types(self) -> set[str]:
        return set(_csv(self.allowed_upload_content_types))

    @property
    def redis_configured(self) -> bool:
        return bool(self.upstash_redis_rest_url and self.upstash_redis_rest_token)

    @property
    def r2_configured(self) -> bool:
        return all(
            (
                self.r2_account_id,
                self.r2_access_key_id,
                self.r2_secret_access_key,
                self.r2_bucket,
            )
        )

    def validate_runtime(self) -> None:
        if self.environment not in {"staging", "production"}:
            return
        errors: list[str] = []
        if not self.sqlalchemy_database_url.startswith("postgresql+asyncpg://"):
            errors.append("DATABASE_URL must be a PostgreSQL/Neon URL")
        if not self.clerk_secret_key and not self.clerk_jwt_key:
            errors.append("CLERK_SECRET_KEY or CLERK_JWT_KEY is required")
        if not self.authorized_parties:
            errors.append("CLERK_AUTHORIZED_PARTIES cannot be empty")
        if not self.redis_configured:
            errors.append("Upstash REST credentials are required")
        if not self.r2_configured:
            errors.append("Cloudflare R2 credentials are required")
        if errors:
            raise RuntimeError("Invalid production configuration: " + "; ".join(errors))


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
