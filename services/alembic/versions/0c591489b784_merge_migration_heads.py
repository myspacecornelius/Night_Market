"""merge_migration_heads

Revision ID: 0c591489b784
Revises: 003_add_heat_map_tiles, ab16ff12cacf
Create Date: 2025-10-10 01:59:12.781207

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0c591489b784'
down_revision: Union[str, Sequence[str], None] = ('003_add_heat_map_tiles', 'ab16ff12cacf')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
