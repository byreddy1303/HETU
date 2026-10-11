"""Drop the PostgreSQL PYQ catalog; the bank ships as bundled JSON.

The question bank is authored once as JSON (`public/pyq`) and mirrored into
`app/data/pyq` for the API bundle. The duplicate `pyq_banks` and
`pyq_catalog_questions` tables are removed to reduce database storage usage.
Account data, attempts and their historical snapshots in `records` are unchanged.
Deploy the JSON-backed API before applying this migration.

Revision ID: 202609280004
Revises: 202609280003
"""

from alembic import op

revision = "202609280004"
down_revision = "202609280003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the destructive-write rejection triggers before their tables.
    op.execute("DROP TRIGGER IF EXISTS reject_pyq_question_change ON pyq_catalog_questions")
    op.execute("DROP TRIGGER IF EXISTS reject_pyq_question_truncate ON pyq_catalog_questions")
    op.execute("DROP TRIGGER IF EXISTS reject_pyq_bank_delete ON pyq_banks")
    op.execute("DROP TRIGGER IF EXISTS reject_pyq_bank_truncate ON pyq_banks")
    # Child table first because it has a RESTRICT foreign key to pyq_banks.
    op.execute("DROP TABLE IF EXISTS pyq_catalog_questions")
    op.execute("DROP TABLE IF EXISTS pyq_banks")


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade disabled; use a reviewed forward migration")
