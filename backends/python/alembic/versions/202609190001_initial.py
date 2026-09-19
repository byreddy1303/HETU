"""Create the Clerk-owned Hetu API schema.

Revision ID: 202609190001
Revises:
Create Date: 2026-09-19 14:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "202609190001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("username", sa.String(length=128), nullable=True),
        sa.Column("display_name", sa.String(length=256), nullable=True),
        sa.Column(
            "profile",
            postgresql.JSONB(astext_type=sa.Text(), none_as_null=True),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_username", "users", ["username"], unique=False)

    op.create_table(
        "records",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("collection", sa.String(length=64), nullable=False),
        sa.Column("owner_id", sa.String(length=128), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column(
            "data",
            postgresql.JSONB(astext_type=sa.Text(), none_as_null=True),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("version > 0", name="ck_records_positive_version"),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name="fk_records_owner_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_records"),
        sa.UniqueConstraint(
            "collection", "owner_id", "external_id", name="uq_records_record_identity"
        ),
    )
    op.create_index("ix_records_owner_id", "records", ["owner_id"], unique=False)
    op.create_index(
        "ix_records_owner_collection_updated",
        "records",
        ["owner_id", "collection", sa.text("updated_at DESC")],
        unique=False,
    )
    op.create_index("ix_records_data_gin", "records", ["data"], postgresql_using="gin")

    op.create_table(
        "file_objects",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=128), nullable=False),
        sa.Column("object_key", sa.String(length=1024), nullable=False),
        sa.Column("original_name", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("etag", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0", name="ck_file_objects_nonnegative_size"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'ready', 'deleted')", name="ck_file_objects_valid_file_status"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name="fk_file_objects_owner_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_file_objects"),
        sa.UniqueConstraint("object_key", name="uq_file_objects_object_key"),
    )
    op.create_index("ix_file_objects_owner_id", "file_objects", ["owner_id"], unique=False)

    op.create_table(
        "background_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("owner_id", sa.String(length=128), nullable=True),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text(), none_as_null=True),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=16), server_default="queued", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="5", nullable=False),
        sa.Column(
            "run_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "attempts >= 0 AND max_attempts > 0", name="ck_background_jobs_valid_attempts"
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed')",
            name="ck_background_jobs_valid_job_status",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="fk_background_jobs_owner_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_background_jobs"),
        sa.UniqueConstraint("idempotency_key", name="uq_background_jobs_job_idempotency_key"),
    )
    op.create_index("ix_background_jobs_owner_id", "background_jobs", ["owner_id"], unique=False)
    op.create_index("ix_background_jobs_due", "background_jobs", ["status", "run_at"], unique=False)

    op.create_table(
        "webhook_receipts",
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("event_id", name="pk_webhook_receipts"),
    )


def downgrade() -> None:
    op.drop_table("webhook_receipts")
    op.drop_index("ix_background_jobs_due", table_name="background_jobs")
    op.drop_index("ix_background_jobs_owner_id", table_name="background_jobs")
    op.drop_table("background_jobs")
    op.drop_index("ix_file_objects_owner_id", table_name="file_objects")
    op.drop_table("file_objects")
    op.drop_index("ix_records_data_gin", table_name="records", postgresql_using="gin")
    op.drop_index("ix_records_owner_collection_updated", table_name="records")
    op.drop_index("ix_records_owner_id", table_name="records")
    op.drop_table("records")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
