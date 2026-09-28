"""Separate external authentication subjects from permanent user IDs.

Revision ID: 202609280001
Revises: 202609270001
"""

import sqlalchemy as sa

from alembic import op

revision = "202609280001"
down_revision = "202609270001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_identities",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.String(128),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column(
            "last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("provider", "subject", name="uq_user_identities_provider_subject"),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_identities_user_provider"),
    )
    op.create_index("ix_user_identities_user_id", "user_identities", ["user_id"])

    # Existing users were keyed by the Clerk subject. This preserves all foreign-key
    # ownership while future accounts receive provider-independent UUIDs.
    op.execute(
        "INSERT INTO user_identities(user_id, provider, subject) SELECT id, 'clerk', id FROM users"
    )
    op.execute(
        "CREATE TRIGGER retain_entity_revision AFTER INSERT OR UPDATE ON user_identities "
        "FOR EACH ROW EXECUTE FUNCTION hetu_retain_entity_revision()"
    )
    op.execute(
        "CREATE TRIGGER reject_user_identity_delete BEFORE DELETE ON user_identities "
        "FOR EACH ROW EXECUTE FUNCTION hetu_reject_destructive_write()"
    )
    op.execute(
        "CREATE TRIGGER reject_user_identity_truncate BEFORE TRUNCATE ON user_identities "
        "FOR EACH STATEMENT EXECUTE FUNCTION hetu_reject_destructive_write()"
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade disabled; use a reviewed forward migration")
