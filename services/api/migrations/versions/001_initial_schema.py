"""Initial database schema for Sniped platform

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types
    op.execute("CREATE TYPE verificationlevel AS ENUM ('EMAIL', 'PHONE', 'ID_VERIFIED', 'PREMIUM')")
    op.execute("CREATE TYPE eventtype AS ENUM ('DROP', 'RESTOCK', 'FIND', 'MEETUP')")
    op.execute("CREATE TYPE storetype AS ENUM ('retail', 'thrift', 'outlet', 'safezone')")
    op.execute("CREATE TYPE lacesreason AS ENUM ('SPOT', 'VERIFY', 'KNOWLEDGE', 'TRADE', 'GOOD_VIBES', 'DROPZONE')")
    op.execute("CREATE TYPE inventorystatus AS ENUM ('AVAILABLE', 'SOLD', 'HIDDEN')")
    op.execute("CREATE TYPE condition AS ENUM ('DS', 'VNDS', 'USED')")
    
    # Create users table
    op.create_table('users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('handle', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('verification_level', postgresql.ENUM('EMAIL', 'PHONE', 'ID_VERIFIED', 'PREMIUM', name='verificationlevel'), nullable=True),
        sa.Column('legit_score', sa.Integer(), nullable=True),
        sa.Column('photo_url', sa.Text(), nullable=True),
        sa.Column('notif_radius_km', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('handle')
    )
    
    # Create stores table
    op.create_table('stores',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('type', postgresql.ENUM('retail', 'thrift', 'outlet', 'safezone', name='storetype'), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create events table
    op.create_table('events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('type', postgresql.ENUM('DROP', 'RESTOCK', 'FIND', 'MEETUP', name='eventtype'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('store_id', sa.String(length=50), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('verified_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create laces_ledger table
    op.create_table('laces_ledger',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('delta', sa.Integer(), nullable=False),
        sa.Column('reason', postgresql.ENUM('SPOT', 'VERIFY', 'KNOWLEDGE', 'TRADE', 'GOOD_VIBES', 'DROPZONE', name='lacesreason'), nullable=False),
        sa.Column('ref_type', sa.String(length=50), nullable=True),
        sa.Column('ref_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create checkins table
    op.create_table('checkins',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('store_id', sa.String(length=50), nullable=False),
        sa.Column('method', sa.String(length=20), nullable=True),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lng', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create inventory table
    op.create_table('inventory',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('brand', sa.String(length=100), nullable=True),
        sa.Column('model', sa.String(length=255), nullable=True),
        sa.Column('size', sa.String(length=10), nullable=True),
        sa.Column('condition', postgresql.ENUM('DS', 'VNDS', 'USED', name='condition'), nullable=True),
        sa.Column('photos', sa.JSON(), nullable=True),
        sa.Column('ask_price', sa.Integer(), nullable=True),
        sa.Column('status', postgresql.ENUM('AVAILABLE', 'SOLD', 'HIDDEN', name='inventorystatus'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create meetups table
    op.create_table('meetups',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('host_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('store_id', sa.String(length=50), nullable=True),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('start_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('qr_code', sa.String(length=255), nullable=True),
        sa.Column('auth_station', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['host_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create trades table
    op.create_table('trades',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('buyer_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('seller_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('meetup_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('escrow', sa.Boolean(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['meetup_id'], ['meetups.id'], ),
        sa.ForeignKeyConstraint(['seller_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create verifications table
    op.create_table('verifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('verifier_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ),
        sa.ForeignKeyConstraint(['verifier_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create achievements_progress table
    op.create_table('achievements_progress',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.Column('last_event_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('user_id', 'key')
    )
    
    # Create indexes for performance
    op.create_index('idx_events_user_id', 'events', ['user_id'])
    op.create_index('idx_events_store_id', 'events', ['store_id'])
    op.create_index('idx_events_created_at', 'events', ['created_at'])
    op.create_index('idx_events_lat_lng', 'events', ['lat', 'lng'])
    
    op.create_index('idx_laces_ledger_user_id', 'laces_ledger', ['user_id'])
    op.create_index('idx_laces_ledger_created_at', 'laces_ledger', ['created_at'])
    
    op.create_index('idx_checkins_user_id', 'checkins', ['user_id'])
    op.create_index('idx_checkins_store_id', 'checkins', ['store_id'])
    
    op.create_index('idx_inventory_user_id', 'inventory', ['user_id'])
    op.create_index('idx_inventory_status', 'inventory', ['status'])
    
    op.create_index('idx_trades_buyer_id', 'trades', ['buyer_id'])
    op.create_index('idx_trades_seller_id', 'trades', ['seller_id'])
    op.create_index('idx_trades_status', 'trades', ['status'])
    
    op.create_index('idx_verifications_event_id', 'verifications', ['event_id'])
    op.create_index('idx_verifications_verifier_id', 'verifications', ['verifier_id'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_verifications_verifier_id', table_name='verifications')
    op.drop_index('idx_verifications_event_id', table_name='verifications')
    op.drop_index('idx_trades_status', table_name='trades')
    op.drop_index('idx_trades_seller_id', table_name='trades')
    op.drop_index('idx_trades_buyer_id', table_name='trades')
    op.drop_index('idx_inventory_status', table_name='inventory')
    op.drop_index('idx_inventory_user_id', table_name='inventory')
    op.drop_index('idx_checkins_store_id', table_name='checkins')
    op.drop_index('idx_checkins_user_id', table_name='checkins')
    op.drop_index('idx_laces_ledger_created_at', table_name='laces_ledger')
    op.drop_index('idx_laces_ledger_user_id', table_name='laces_ledger')
    op.drop_index('idx_events_lat_lng', table_name='events')
    op.drop_index('idx_events_created_at', table_name='events')
    op.drop_index('idx_events_store_id', table_name='events')
    op.drop_index('idx_events_user_id', table_name='events')
    
    # Drop tables
    op.drop_table('achievements_progress')
    op.drop_table('verifications')
    op.drop_table('trades')
    op.drop_table('meetups')
    op.drop_table('inventory')
    op.drop_table('checkins')
    op.drop_table('laces_ledger')
    op.drop_table('events')
    op.drop_table('stores')
    op.drop_table('users')
    
    # Drop enum types
    op.execute('DROP TYPE condition')
    op.execute('DROP TYPE inventorystatus')
    op.execute('DROP TYPE lacesreason')
    op.execute('DROP TYPE storetype')
    op.execute('DROP TYPE eventtype')
    op.execute('DROP TYPE verificationlevel')
