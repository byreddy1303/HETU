"""Store the audited PYQ catalog in PostgreSQL.

Revision ID: 202609280002
Revises: 202609280001
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "202609280002"
down_revision = "202609280001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pyq_banks",
        sa.Column("version", sa.String(128), primary_key=True),
        sa.Column("manifest", JSONB, nullable=False),
        sa.Column("question_count", sa.Integer, nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("active", sa.Boolean, server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_pyq_banks_active", "pyq_banks", ["active"])
    op.create_index(
        "uq_pyq_banks_one_active",
        "pyq_banks",
        ["active"],
        unique=True,
        postgresql_where=sa.text("active"),
    )
    op.create_table(
        "pyq_catalog_questions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "bank_version",
            sa.String(128),
            sa.ForeignKey("pyq_banks.version", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("question_uid", sa.String(128), nullable=False),
        sa.Column("book_slug", sa.String(64), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("set_number", sa.Integer),
        sa.Column("number", sa.String(32), nullable=False),
        sa.Column("paper_label", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(128), nullable=False),
        sa.Column("subject_slug", sa.String(64), nullable=False),
        sa.Column("classification_hint", JSONB),
        sa.Column("topic", sa.String(128), nullable=False),
        sa.Column("topic_slug", sa.String(64), nullable=False),
        sa.Column("subtopics", JSONB, nullable=False),
        sa.Column("marks", sa.Integer),
        sa.Column("question_type", sa.String(24), nullable=False),
        sa.Column("choices", JSONB),
        sa.Column("answer", JSONB),
        sa.Column("tolerance", JSONB),
        sa.Column("answer_status", sa.String(24), nullable=False),
        sa.Column("html", sa.Text, nullable=False),
        sa.Column("source_url", sa.String(2048), nullable=False),
        sa.Column("answer_source", JSONB),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("integrity_status", sa.String(24), nullable=False),
        sa.Column("duplicate_of_uid", sa.String(128)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "marks IS NULL OR marks > 0", name="ck_pyq_catalog_questions_positive_marks"
        ),
        sa.CheckConstraint(
            "answer_status IN ('available', 'ambiguous', 'marks-to-all', 'unsupported')",
            name="ck_pyq_catalog_questions_valid_answer_status",
        ),
        sa.CheckConstraint(
            "integrity_status IN ('verified', 'unscorable', 'quarantined')",
            name="ck_pyq_catalog_questions_valid_integrity_status",
        ),
        sa.UniqueConstraint("bank_version", "question_uid", name="uq_pyq_catalog_bank_uid"),
    )
    op.create_index(
        "ix_pyq_catalog_bank_subject",
        "pyq_catalog_questions",
        ["bank_version", "subject_slug"],
    )
    op.create_index(
        "ix_pyq_catalog_bank_paper",
        "pyq_catalog_questions",
        ["bank_version", "paper_label", "number"],
    )
    op.create_index("ix_pyq_catalog_content_hash", "pyq_catalog_questions", ["content_hash"])
    op.execute(
        "CREATE TRIGGER reject_pyq_question_change BEFORE UPDATE OR DELETE "
        "ON pyq_catalog_questions FOR EACH ROW EXECUTE FUNCTION hetu_reject_destructive_write()"
    )
    op.execute(
        "CREATE TRIGGER reject_pyq_question_truncate BEFORE TRUNCATE ON pyq_catalog_questions "
        "FOR EACH STATEMENT EXECUTE FUNCTION hetu_reject_destructive_write()"
    )
    op.execute(
        "CREATE TRIGGER reject_pyq_bank_delete BEFORE DELETE ON pyq_banks "
        "FOR EACH ROW EXECUTE FUNCTION hetu_reject_destructive_write()"
    )
    op.execute(
        "CREATE TRIGGER reject_pyq_bank_truncate BEFORE TRUNCATE ON pyq_banks "
        "FOR EACH STATEMENT EXECUTE FUNCTION hetu_reject_destructive_write()"
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade disabled; use a reviewed forward migration")
