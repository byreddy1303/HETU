"""Retain revisions, tombstones, and reject destructive database operations.

Revision ID: 202609190002
Revises: 202609190001
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "202609190002"
down_revision = "202609190001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("records", sa.Column("deleted_at", sa.DateTime(timezone=True)))
    op.create_table(
        "record_revisions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("record_id", sa.BigInteger, nullable=False),
        sa.Column("owner_id", sa.String(128), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column(
            "recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("record_id", "version", name="uq_record_revisions_version"),
    )
    op.create_index(
        "ix_record_revisions_owner_record", "record_revisions", ["owner_id", "record_id"]
    )
    op.drop_constraint("fk_records_owner_id_users", "records", type_="foreignkey")
    op.create_foreign_key(
        "fk_records_owner_id_users", "records", "users", ["owner_id"], ["id"], ondelete="RESTRICT"
    )
    op.execute("""
        CREATE FUNCTION hetu_retain_record_revision() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'UPDATE' THEN
            IF NEW.id <> OLD.id OR NEW.owner_id <> OLD.owner_id
               OR NEW.collection <> OLD.collection OR NEW.external_id <> OLD.external_id THEN
              RAISE EXCEPTION 'Record identity is immutable';
            END IF;
            IF OLD.collection IN ('learning_events', 'pyq_attempts') THEN
              RAISE EXCEPTION 'Evidence is append-only';
            END IF;
            IF NEW.version <> OLD.version + 1 THEN
              RAISE EXCEPTION 'Every update requires the next revision';
            END IF;
          END IF;
          INSERT INTO record_revisions(record_id, owner_id, version, snapshot)
          VALUES(NEW.id, NEW.owner_id, NEW.version, NEW.data || jsonb_build_object(
            'id', NEW.external_id, 'user_id', NEW.owner_id, 'version', NEW.version,
            'created_at', NEW.created_at, 'updated_at', NEW.updated_at,
            'deleted_at', NEW.deleted_at));
          RETURN NEW;
        END $$
    """)
    op.execute("""
        INSERT INTO record_revisions(record_id, owner_id, version, snapshot)
        SELECT id, owner_id, version, data || jsonb_build_object(
          'id', external_id, 'user_id', owner_id, 'version', version,
          'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)
        FROM records
    """)
    op.execute("""
        CREATE TRIGGER retain_record_revision AFTER INSERT OR UPDATE ON records
        FOR EACH ROW EXECUTE FUNCTION hetu_retain_record_revision()
    """)
    op.execute("""
        CREATE FUNCTION hetu_reject_destructive_write() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'Physical deletion/truncation or history mutation is disabled';
        END $$
    """)
    for table in ("records", "users", "file_objects", "record_revisions"):
        op.execute(
            f"CREATE TRIGGER reject_delete BEFORE DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION hetu_reject_destructive_write()"
        )
        op.execute(
            f"CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON {table} "
            "FOR EACH STATEMENT EXECUTE FUNCTION hetu_reject_destructive_write()"
        )
    op.execute(
        "CREATE TRIGGER reject_update BEFORE UPDATE ON record_revisions "
        "FOR EACH ROW EXECUTE FUNCTION hetu_reject_destructive_write()"
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade disabled; use a reviewed forward migration")
