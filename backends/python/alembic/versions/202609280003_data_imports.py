"""Record verified source-data imports.

Revision ID: 202609280003
Revises: 202609280002
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "202609280003"
down_revision = "202609280002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_imports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("source", sa.String(64), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("row_counts", JSONB, nullable=False),
        sa.Column(
            "completed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute(
        "CREATE TRIGGER reject_data_import_change BEFORE UPDATE OR DELETE ON data_imports "
        "FOR EACH ROW EXECUTE FUNCTION hetu_reject_destructive_write()"
    )
    op.execute(
        "CREATE TRIGGER reject_data_import_truncate BEFORE TRUNCATE ON data_imports "
        "FOR EACH STATEMENT EXECUTE FUNCTION hetu_reject_destructive_write()"
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade disabled; use a reviewed forward migration")
