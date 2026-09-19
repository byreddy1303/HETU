"""Retain account and attachment metadata history in the database.

Revision ID: 202609200001
Revises: 202609190002
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "202609200001"
down_revision = "202609190002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entity_revisions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("entity", sa.String(32), nullable=False),
        sa.Column("entity_id", sa.String(128), nullable=False),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column(
            "recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_entity_revisions_lookup", "entity_revisions", ["entity", "entity_id", "id"])
    op.execute("""
      CREATE FUNCTION hetu_retain_entity_revision() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND NEW.id <> OLD.id THEN
          RAISE EXCEPTION 'Identity is immutable';
        END IF;
        INSERT INTO entity_revisions(entity, entity_id, snapshot)
          VALUES(TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
        RETURN NEW;
      END $$
    """)
    for table in ("users", "file_objects"):
        op.execute(
            f"INSERT INTO entity_revisions(entity, entity_id, snapshot) "
            f"SELECT '{table}', id, to_jsonb(t) FROM {table} t"
        )
        op.execute(
            f"CREATE TRIGGER retain_entity_revision AFTER INSERT OR UPDATE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION hetu_retain_entity_revision()"
        )
    op.execute(
        "CREATE TRIGGER reject_change BEFORE UPDATE OR DELETE ON entity_revisions "
        "FOR EACH ROW EXECUTE FUNCTION hetu_reject_destructive_write()"
    )
    op.execute(
        "CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON entity_revisions "
        "FOR EACH STATEMENT EXECUTE FUNCTION hetu_reject_destructive_write()"
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade disabled; use a reviewed forward migration")
