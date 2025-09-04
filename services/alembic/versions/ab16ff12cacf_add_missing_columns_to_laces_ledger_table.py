"""add missing columns to laces_ledger table

Revision ID: ab16ff12cacf
Revises: b53bb8a48bc7
Create Date: 2025-09-04 04:22:04.150935

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab16ff12cacf'
down_revision: Union[str, Sequence[str], None] = 'b53bb8a48bc7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('laces_ledger', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('laces_ledger', sa.Column('reference_id', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('laces_ledger', 'reference_id')
    op.drop_column('laces_ledger', 'description')
