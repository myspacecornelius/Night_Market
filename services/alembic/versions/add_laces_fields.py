"""add laces transaction types and balance_after field

Revision ID: add_laces_fields
Revises:
Create Date: 2025-01-06

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_laces_fields'
down_revision = None  # Set this to your latest migration
branch_labels = None
depends_on = None


def upgrade():
    # Add new transaction types to enum
    op.execute("""
        ALTER TYPE transaction_type_enum ADD VALUE IF NOT EXISTS 'POST_REWARD';
        ALTER TYPE transaction_type_enum ADD VALUE IF NOT EXISTS 'CHECKIN_REWARD';
    """)

    # Add balance_after column if it doesn't exist
    op.execute("""
        ALTER TABLE laces_ledger
        ADD COLUMN IF NOT EXISTS balance_after INTEGER DEFAULT 0 NOT NULL;
    """)


def downgrade():
    # Remove balance_after column
    op.execute("""
        ALTER TABLE laces_ledger
        DROP COLUMN IF EXISTS balance_after;
    """)

    # Note: PostgreSQL doesn't support removing enum values easily
    # Would require recreating the enum type
