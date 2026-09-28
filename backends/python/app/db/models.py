from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base, TimestampMixin

JSON_TYPE = JSON().with_variant(JSONB(none_as_null=True), "postgresql")


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    username: Mapped[str | None] = mapped_column(String(128), index=True)
    display_name: Mapped[str | None] = mapped_column(String(256))
    profile: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    records: Mapped[list[Record]] = relationship(back_populates="owner", passive_deletes="all")
    identities: Mapped[list[UserIdentity]] = relationship(
        back_populates="user", passive_deletes="all"
    )


class UserIdentity(TimestampMixin, Base):
    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_user_identities_provider_subject"),
        UniqueConstraint("user_id", "provider", name="uq_user_identities_user_provider"),
        Index("ix_user_identities_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="identities")


class PyqBank(TimestampMixin, Base):
    __tablename__ = "pyq_banks"
    __table_args__ = (
        Index(
            "uq_pyq_banks_one_active",
            "active",
            unique=True,
            postgresql_where=text("active"),
            sqlite_where=text("active = 1"),
        ),
    )

    version: Mapped[str] = mapped_column(String(128), primary_key=True)
    manifest: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)


class PyqCatalogQuestion(TimestampMixin, Base):
    __tablename__ = "pyq_catalog_questions"
    __table_args__ = (
        UniqueConstraint("bank_version", "question_uid", name="uq_pyq_catalog_bank_uid"),
        Index("ix_pyq_catalog_bank_subject", "bank_version", "subject_slug"),
        Index("ix_pyq_catalog_bank_paper", "bank_version", "paper_label", "number"),
        Index("ix_pyq_catalog_content_hash", "content_hash"),
        CheckConstraint("marks IS NULL OR marks > 0", name="positive_marks"),
        CheckConstraint(
            "answer_status IN ('available', 'ambiguous', 'marks-to-all', 'unsupported')",
            name="valid_answer_status",
        ),
        CheckConstraint(
            "integrity_status IN ('verified', 'unscorable', 'quarantined')",
            name="valid_integrity_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    bank_version: Mapped[str] = mapped_column(
        ForeignKey("pyq_banks.version", ondelete="RESTRICT"), nullable=False
    )
    question_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    book_slug: Mapped[str] = mapped_column(String(64), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    set_number: Mapped[int | None] = mapped_column(Integer)
    number: Mapped[str] = mapped_column(String(32), nullable=False)
    paper_label: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(128), nullable=False)
    subject_slug: Mapped[str] = mapped_column(String(64), nullable=False)
    classification_hint: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    topic: Mapped[str] = mapped_column(String(128), nullable=False)
    topic_slug: Mapped[str] = mapped_column(String(64), nullable=False)
    subtopics: Mapped[list[str]] = mapped_column(JSON_TYPE, default=list, nullable=False)
    marks: Mapped[int | None] = mapped_column(Integer)
    question_type: Mapped[str] = mapped_column(String(24), nullable=False)
    choices: Mapped[list[str] | None] = mapped_column(JSON_TYPE)
    answer: Mapped[Any | None] = mapped_column(JSON_TYPE)
    tolerance: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    answer_status: Mapped[str] = mapped_column(String(24), nullable=False)
    html: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    answer_source: Mapped[Any | None] = mapped_column(JSON_TYPE)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    integrity_status: Mapped[str] = mapped_column(String(24), nullable=False)
    duplicate_of_uid: Mapped[str | None] = mapped_column(String(128))


class DataImport(Base):
    __tablename__ = "data_imports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    row_counts: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Record(TimestampMixin, Base):
    __tablename__ = "records"
    __table_args__ = (
        UniqueConstraint(
            "collection", "owner_id", "external_id", name="uq_records_record_identity"
        ),
        CheckConstraint("version > 0", name="positive_version"),
        Index(
            "ix_records_owner_collection_updated",
            "owner_id",
            "collection",
            text("updated_at DESC"),
        ),
        Index("ix_records_data_gin", "data", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    collection: Mapped[str] = mapped_column(String(64), nullable=False)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner: Mapped[User] = relationship(back_populates="records")


class RecordRevision(Base):
    """Append-only copies; no cascading FK back to the live row."""

    __tablename__ = "record_revisions"
    __table_args__ = (
        UniqueConstraint("record_id", "version", name="uq_record_revisions_version"),
        Index("ix_record_revisions_owner_record", "owner_id", "record_id"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    record_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    owner_id: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EntityRevision(Base):
    __tablename__ = "entity_revisions"
    __table_args__ = (Index("ix_entity_revisions_lookup", "entity", "entity_id", "id"),)

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    entity: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(128), nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FileObject(TimestampMixin, Base):
    __tablename__ = "file_objects"
    __table_args__ = (
        UniqueConstraint("object_key", name="uq_file_objects_object_key"),
        CheckConstraint("size_bytes IS NULL OR size_bytes >= 0", name="nonnegative_size"),
        CheckConstraint("status IN ('pending', 'ready', 'deleted')", name="valid_file_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_name: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    etag: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)


class BackgroundJob(TimestampMixin, Base):
    __tablename__ = "background_jobs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_background_jobs_job_idempotency_key"),
        CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed')", name="valid_job_status"
        ),
        CheckConstraint("attempts >= 0 AND max_attempts > 0", name="valid_attempts"),
        Index("ix_background_jobs_due", "status", "run_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="queued", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(String(255))


class WebhookReceipt(Base):
    __tablename__ = "webhook_receipts"

    event_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AccessRequest(TimestampMixin, Base):
    __tablename__ = "access_requests"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'declined')", name="valid_status"),
        Index("ix_access_requests_status_created", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    invite_id: Mapped[str | None] = mapped_column(String(36), index=True)
    decided_by: Mapped[str | None] = mapped_column(String(128))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))


class Invite(TimestampMixin, Base):
    __tablename__ = "invites"
    __table_args__ = (
        UniqueConstraint("token", name="uq_invites_token"),
        Index("ix_invites_token", "token", unique=True),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    token: Mapped[str] = mapped_column(String(128), nullable=False)
    issued_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str | None] = mapped_column(String(320))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_by: Mapped[str | None] = mapped_column(String(128), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Buddy(TimestampMixin, Base):
    __tablename__ = "buddies"
    __table_args__ = (
        UniqueConstraint("user_a", "user_b", name="uq_buddies_pair"),
        CheckConstraint("user_a < user_b", name="canonical_pair"),
        CheckConstraint("status IN ('pending', 'active', 'paused')", name="valid_status"),
        Index("ix_buddies_user_a_status", "user_a", "status"),
        Index("ix_buddies_user_b_status", "user_b", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_a: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_b: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    requested_by: Mapped[str | None] = mapped_column(String(128))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decline_reason: Mapped[str | None] = mapped_column(Text)
    last_request_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BuddyMessage(Base):
    __tablename__ = "buddy_messages"
    __table_args__ = (
        CheckConstraint("kind IN ('text', 'question')", name="valid_kind"),
        Index("ix_buddy_messages_buddy_created", "buddy_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    buddy_id: Mapped[str] = mapped_column(
        ForeignKey("buddies.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    question_ref: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
