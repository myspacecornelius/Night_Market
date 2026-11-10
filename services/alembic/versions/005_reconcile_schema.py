"""Reconcile schema with models: dropzone tables, laces balance, enum values, post location

The dropzone tables only existed in an orphaned migration outside this chain
(services/migrations/versions/004, revising a non-existent '003'), so they were
never created. The LACES ledger model also gained a column and enum values that
no migration added.

Revision ID: 005_reconcile_schema
Revises: 0c591489b784
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geography
from sqlalchemy.dialects import postgresql

revision: str = '005_reconcile_schema'
down_revision: Union[str, Sequence[str], None] = '0c591489b784'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Values the models use that earlier migrations never added to the enum types.
NEW_TRANSACTION_TYPES = (
    'ADMIN_ADD', 'ADMIN_REMOVE', 'PURCHASE', 'REFUND',
    'CONTEST_REWARD', 'POST_REWARD', 'CHECKIN_REWARD',
)
NEW_POST_TYPES = ('HEAT_CHECK', 'INTEL_REPORT')


def upgrade() -> None:
    for value in NEW_TRANSACTION_TYPES:
        op.execute(f"ALTER TYPE transaction_type_enum ADD VALUE IF NOT EXISTS '{value}'")
    for value in NEW_POST_TYPES:
        op.execute(f"ALTER TYPE post_type_enum ADD VALUE IF NOT EXISTS '{value}'")

    op.add_column(
        'laces_ledger',
        sa.Column('balance_after', sa.Integer(), nullable=False, server_default='0'),
    )

    # The model allows posts without a location; the original table did not.
    op.alter_column('posts', 'location_id', existing_type=postgresql.UUID(as_uuid=True), nullable=True)

    op.create_table(
        'dropzones',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=False),
        sa.Column('center_point', Geography(geometry_type='POINT', srid=4326, spatial_index=False), nullable=False),
        sa.Column('radius_meters', sa.Float(), nullable=False),
        sa.Column('boundary_polygon', Geography(geometry_type='POLYGON', srid=4326, spatial_index=False), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.Enum('SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED', name='dropzonestatus'), nullable=False),
        sa.Column('max_capacity', sa.Integer(), nullable=True),
        sa.Column('check_in_radius', sa.Float(), nullable=False),
        sa.Column('rules', sa.Text(), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('allow_posts', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_dropzones_center_point', 'dropzones', ['center_point'], postgresql_using='gist')
    op.create_index('idx_dropzones_boundary_polygon', 'dropzones', ['boundary_polygon'], postgresql_using='gist')

    op.create_table(
        'dropzone_members',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('dropzone_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('dropzones.id'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=False),
        sa.Column('role', sa.Enum('MEMBER', 'MODERATOR', 'OWNER', name='memberrole'), nullable=False),
        sa.Column('rsvp_status', sa.Enum('going', 'maybe', 'not_going', name='rsvp_status_enum'), nullable=True),
        sa.Column('rsvp_message', sa.Text(), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    )

    op.create_table(
        'dropzone_checkins',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('dropzone_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('dropzones.id'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=False),
        sa.Column('check_in_location', Geography(geometry_type='POINT', srid=4326, spatial_index=False), nullable=False),
        sa.Column('distance_from_center', sa.Float(), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('photo_url', sa.String(), nullable=True),
        sa.Column('streak_count', sa.Integer(), nullable=False),
        sa.Column('points_earned', sa.Integer(), nullable=False),
        sa.Column('checked_in_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    )
    op.create_index(
        'idx_dropzone_checkins_check_in_location', 'dropzone_checkins', ['check_in_location'], postgresql_using='gist'
    )


def downgrade() -> None:
    op.drop_table('dropzone_checkins')
    op.drop_table('dropzone_members')
    op.drop_table('dropzones')
    for enum_name in ('rsvp_status_enum', 'memberrole', 'dropzonestatus'):
        op.execute(f'DROP TYPE IF EXISTS {enum_name}')
    op.drop_column('laces_ledger', 'balance_after')
    # Postgres cannot remove enum values; the added labels are left in place.
    # posts.location_id stays nullable: rows without a location may now exist.
