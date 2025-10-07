"""Add heat map tiles table for performance optimization

Revision ID: 003_add_heat_map_tiles
Revises: 002_sprint1_models
Create Date: 2024-10-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003_add_heat_map_tiles'
down_revision = '002_sprint1_models'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create heat_map_tiles table
    op.create_table(
        'heat_map_tiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('geohash', sa.String(length=12), nullable=False),
        sa.Column('precision', sa.Integer(), nullable=False),
        sa.Column('time_window', sa.String(length=10), nullable=False),
        sa.Column('signal_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('post_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_boost_score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('center_lat', sa.Float(), nullable=False),
        sa.Column('center_lng', sa.Float(), nullable=False),
        sa.Column('top_brands', sa.JSON(), nullable=True),
        sa.Column('top_tags', sa.JSON(), nullable=True),
        sa.Column('sample_posts', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_heatmap_geohash_window', 'geohash', 'time_window'),
        sa.Index('ix_heatmap_precision_expires', 'precision', 'expires_at'),
        sa.Index('ix_heatmap_expires', 'expires_at'),
        sa.Index('ix_heat_map_tiles_geohash', 'geohash'),
    )


def downgrade() -> None:
    # Drop heat_map_tiles table
    op.drop_table('heat_map_tiles')