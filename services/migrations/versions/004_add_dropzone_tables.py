"""add dropzone tables

Revision ID: 004
Revises: 003
Create Date: 2025-09-02 04:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from geoalchemy2 import Geography


# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create dropzones table
    op.create_table('dropzones',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=False),
        sa.Column('center_point', Geography(geometry_type='POINT', srid=4326), nullable=False),
        sa.Column('radius_meters', sa.Float(), nullable=False, default=100.0),
        sa.Column('boundary_polygon', Geography(geometry_type='POLYGON', srid=4326), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.Enum('SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED', name='dropzonestatus'), nullable=False, default='SCHEDULED'),
        sa.Column('max_capacity', sa.Integer(), nullable=True),
        sa.Column('check_in_radius', sa.Float(), nullable=False, default=50.0),
        sa.Column('rules', sa.Text(), nullable=True),
        sa.Column('tags', ARRAY(sa.String()), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, default=True),
        sa.Column('allow_posts', sa.Boolean(), nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Create dropzone_members table
    op.create_table('dropzone_members',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('dropzone_id', UUID(as_uuid=True), sa.ForeignKey('dropzones.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=False),
        sa.Column('role', sa.Enum('MEMBER', 'MODERATOR', 'OWNER', name='memberrole'), nullable=False, default='MEMBER'),
        sa.Column('rsvp_status', sa.Enum('going', 'maybe', 'not_going', name='rsvp_status_enum'), nullable=True),
        sa.Column('rsvp_message', sa.Text(), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Create dropzone_checkins table
    op.create_table('dropzone_checkins',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('dropzone_id', UUID(as_uuid=True), sa.ForeignKey('dropzones.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=False),
        sa.Column('check_in_location', Geography(geometry_type='POINT', srid=4326), nullable=False),
        sa.Column('distance_from_center', sa.Float(), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('photo_url', sa.String(), nullable=True),
        sa.Column('streak_count', sa.Integer(), nullable=False, default=1),
        sa.Column('points_earned', sa.Integer(), nullable=False, default=10),
        sa.Column('checked_in_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Add indexes for performance
    op.create_index('idx_dropzones_center_point', 'dropzones', ['center_point'], postgresql_using='gist')
    op.create_index('idx_dropzones_status', 'dropzones', ['status'])
    op.create_index('idx_dropzone_members_dropzone_user', 'dropzone_members', ['dropzone_id', 'user_id'], unique=True)
    op.create_index('idx_dropzone_checkins_dropzone_user_date', 'dropzone_checkins', ['dropzone_id', 'user_id', sa.text('DATE(checked_in_at)')])


def downgrade() -> None:
    op.drop_index('idx_dropzone_checkins_dropzone_user_date')
    op.drop_index('idx_dropzone_members_dropzone_user')
    op.drop_index('idx_dropzones_status')
    op.drop_index('idx_dropzones_center_point')
    
    op.drop_table('dropzone_checkins')
    op.drop_table('dropzone_members')
    op.drop_table('dropzones')
    
    # Drop enums
    op.execute('DROP TYPE IF EXISTS rsvp_status_enum')
    op.execute('DROP TYPE IF EXISTS memberrole')
    op.execute('DROP TYPE IF EXISTS dropzonestatus')