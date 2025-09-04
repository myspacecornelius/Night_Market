"""add missing columns to posts table

Revision ID: b53bb8a48bc7
Revises: 072ea76d6afd
Create Date: 2025-09-04 04:20:48.150935

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b53bb8a48bc7'
down_revision: Union[str, Sequence[str], None] = '072ea76d6afd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('posts', sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('posts', sa.Column('reply_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('posts', sa.Column('repost_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('posts', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.add_column('posts', sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('posts', sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='f'))
    op.add_column('posts', sa.Column('is_featured', sa.Boolean(), nullable=False, server_default='f'))
    op.add_column('posts', sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='f'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('posts', 'is_archived')
    op.drop_column('posts', 'is_featured')
    op.drop_column('posts', 'is_pinned')
    op.drop_column('posts', 'expires_at')
    op.drop_column('posts', 'updated_at')
    op.drop_column('posts', 'repost_count')
    op.drop_column('posts', 'reply_count')
    op.drop_column('posts', 'view_count')