"""add missing columns to users table

Revision ID: 072ea76d6afd
Revises: b23d7f450244
Create Date: 2025-09-04 04:18:02.150935

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '072ea76d6afd'
down_revision: Union[str, Sequence[str], None] = 'b23d7f450244'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('location', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('website_url', sa.String(length=500), nullable=True))
    op.add_column('users', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.add_column('users', sa.Column('last_active_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.add_column('users', sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='f'))
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='f'))
    op.add_column('users', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='t'))
    op.add_column('users', sa.Column('total_posts', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('total_boosts_sent', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('total_boosts_received', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'total_boosts_received')
    op.drop_column('users', 'total_boosts_sent')
    op.drop_column('users', 'total_posts')
    op.drop_column('users', 'is_active')
    op.drop_column('users', 'is_admin')
    op.drop_column('users', 'is_verified')
    op.drop_column('users', 'last_active_at')
    op.drop_column('users', 'updated_at')
    op.drop_column('users', 'website_url')
    op.drop_column('users', 'location')
    op.drop_column('users', 'bio')