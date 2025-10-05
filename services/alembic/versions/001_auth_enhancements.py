"""Auth enhancements: privacy levels and session tracking

Revision ID: 001_auth_enhancements
Revises: b23d7f450244
Create Date: 2025-10-05 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

# revision identifiers, used by Alembic.
revision = '001_auth_enhancements'
down_revision = 'b23d7f450244'  # Update this to your latest migration
branch_labels = None
depends_on = None


def upgrade():
    """Add auth enhancements"""
    
    # Create privacy level enum
    privacy_enum = sa.Enum('public', 'pseudonymous', 'anon', name='privacy_level_enum')
    privacy_enum.create(op.get_bind())
    
    # Add new columns to users table
    op.add_column('users', sa.Column('home_city', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('privacy_level', privacy_enum, nullable=False, server_default='public'))
    
    # Create user_sessions table
    op.create_table('user_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('refresh_token_hash', sa.String(255), nullable=False, unique=True),
        sa.Column('device_fingerprint', sa.String(255), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('is_revoked', sa.String(1), nullable=False, default='0'),
        sa.Column('revoked_reason', sa.String(100), nullable=True)
    )
    
    # Create indexes for user_sessions
    op.create_index('ix_sessions_user_active', 'user_sessions', ['user_id', 'is_revoked'])
    op.create_index('ix_sessions_token_hash', 'user_sessions', ['refresh_token_hash'])
    op.create_index('ix_sessions_expires', 'user_sessions', ['expires_at'])


def downgrade():
    """Remove auth enhancements"""
    
    # Drop indexes
    op.drop_index('ix_sessions_expires', 'user_sessions')
    op.drop_index('ix_sessions_token_hash', 'user_sessions')
    op.drop_index('ix_sessions_user_active', 'user_sessions')
    
    # Drop user_sessions table
    op.drop_table('user_sessions')
    
    # Remove columns from users table
    op.drop_column('users', 'privacy_level')
    op.drop_column('users', 'home_city')
    
    # Drop privacy level enum
    privacy_enum = sa.Enum('public', 'pseudonymous', 'anon', name='privacy_level_enum')
    privacy_enum.drop(op.get_bind())