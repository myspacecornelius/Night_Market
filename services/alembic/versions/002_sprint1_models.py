"""Sprint 1 models: signals, drops, and stores

Revision ID: 002_sprint1_models  
Revises: 001_auth_enhancements
Create Date: 2025-10-05 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSON
from geoalchemy2 import Geography
import uuid

# revision identifiers, used by Alembic.
revision = '002_sprint1_models'
down_revision = '001_auth_enhancements'
branch_labels = None
depends_on = None


def upgrade():
    """Add Sprint 1 models"""
    
    # Create signal_type enum
    signal_type_enum = sa.Enum(
        'SPOTTED', 'STOCK_CHECK', 'LINE_UPDATE', 'INTEL_REPORT', 
        'HEAT_CHECK', 'DROP_ALERT', 'GENERAL',
        name='signal_type_enum'
    )
    try:
        signal_type_enum.create(op.get_bind())
    except:
        pass  # Enum might already exist
    
    # Create visibility enum (if not exists from posts)
    visibility_enum = sa.Enum('public', 'local', 'followers', 'private', name='visibility_enum')
    try:
        visibility_enum.create(op.get_bind())
    except:
        pass  # Enum might already exist
    
    # Create drop_status enum
    drop_status_enum = sa.Enum(
        'upcoming', 'live', 'sold_out', 'delayed', 'cancelled', 'ended',
        name='drop_status_enum'
    )
    try:
        drop_status_enum.create(op.get_bind())
    except:
        pass  # Enum might already exist
    
    # Create retailer_type enum
    retailer_type_enum = sa.Enum(
        'NIKE', 'ADIDAS', 'FOOTLOCKER', 'FINISH_LINE', 'CHAMPS', 'FOOTACTION',
        'JD_SPORTS', 'SNEAKERSNSTUFF', 'END', 'SIZE', 'BOUTIQUE', 'CONSIGNMENT', 'OTHER',
        name='retailer_type_enum'
    )
    try:
        retailer_type_enum.create(op.get_bind())
    except:
        pass  # Enum might already exist
    
    # Create signals table
    op.create_table('signals',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('geom', Geography(geometry_type='POINT', srid=4326), nullable=False),
        sa.Column('geohash', sa.String(12), nullable=False),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('signal_type', sa.Enum('SPOTTED', 'STOCK_CHECK', 'LINE_UPDATE', 'INTEL_REPORT', 'HEAT_CHECK', 'DROP_ALERT', 'GENERAL', name='signal_type_enum', create_type=False), nullable=False),
        sa.Column('text_content', sa.Text, nullable=True),
        sa.Column('media_url', sa.String(500), nullable=True),
        sa.Column('store_id', UUID(as_uuid=True), nullable=True),  # FK will be added after stores table
        sa.Column('drop_id', UUID(as_uuid=True), nullable=True),   # FK will be added after drops table
        sa.Column('reputation_score', sa.Integer, nullable=False, default=0),
        sa.Column('boost_count', sa.Integer, nullable=False, default=0),
        sa.Column('view_count', sa.Integer, nullable=False, default=0),
        sa.Column('reply_count', sa.Integer, nullable=False, default=0),
        sa.Column('tags', ARRAY(sa.String), nullable=True),
        sa.Column('brand', sa.String(100), nullable=True),
        sa.Column('product_sku', sa.String(100), nullable=True),
        sa.Column('dedupe_hash', sa.String(64), nullable=True),
        sa.Column('is_verified', sa.Boolean, nullable=False, default=False),
        sa.Column('is_flagged', sa.Boolean, nullable=False, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('visibility', sa.Enum('public', 'local', 'followers', 'private', name='visibility_enum', create_type=False), nullable=False, default='public')
    )
    
    # Create stores table
    op.create_table('stores',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False, unique=True),
        sa.Column('geom', Geography(geometry_type='POINT', srid=4326), nullable=False),
        sa.Column('address', sa.Text, nullable=True),
        sa.Column('city', sa.String(100), nullable=False),
        sa.Column('state', sa.String(50), nullable=True),
        sa.Column('country', sa.String(50), nullable=False, default='US'),
        sa.Column('postal_code', sa.String(20), nullable=True),
        sa.Column('retailer_type', sa.Enum('NIKE', 'ADIDAS', 'FOOTLOCKER', 'FINISH_LINE', 'CHAMPS', 'FOOTACTION', 'JD_SPORTS', 'SNEAKERSNSTUFF', 'END', 'SIZE', 'BOUTIQUE', 'CONSIGNMENT', 'OTHER', name='retailer_type_enum', create_type=False), nullable=False),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('website_url', sa.String(500), nullable=True),
        sa.Column('social_links', JSON, nullable=True),
        sa.Column('open_hours', JSON, nullable=True),
        sa.Column('timezone', sa.String(50), nullable=True),
        sa.Column('features', ARRAY(sa.String), nullable=True),
        sa.Column('release_methods', ARRAY(sa.String), nullable=True),
        sa.Column('is_verified', sa.Boolean, nullable=False, default=False),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('signal_count', sa.Integer, nullable=False, default=0),
        sa.Column('external_ids', JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now())
    )
    
    # Create drops table
    op.create_table('drops',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('brand', sa.String(100), nullable=False),
        sa.Column('sku', sa.String(100), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('release_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('retail_price', sa.DECIMAL(10, 2), nullable=True),
        sa.Column('estimated_stock', sa.Integer, nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('images', ARRAY(sa.String), nullable=True),
        sa.Column('status', sa.Enum('upcoming', 'live', 'sold_out', 'delayed', 'cancelled', 'ended', name='drop_status_enum', create_type=False), nullable=False, default='upcoming'),
        sa.Column('regions', ARRAY(sa.String), nullable=True),
        sa.Column('release_type', sa.String(50), nullable=True),
        sa.Column('links', JSON, nullable=True),
        sa.Column('original_source', sa.String(100), nullable=True),
        sa.Column('external_id', sa.String(100), nullable=True),
        sa.Column('hype_score', sa.Integer, nullable=False, default=0),
        sa.Column('interest_count', sa.Integer, nullable=False, default=0),
        sa.Column('signal_count', sa.Integer, nullable=False, default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_featured', sa.Boolean, nullable=False, default=False),
        sa.Column('is_verified', sa.Boolean, nullable=False, default=False)
    )
    
    # Create drop_stores association table
    op.create_table('drop_stores',
        sa.Column('drop_id', UUID(as_uuid=True), sa.ForeignKey('drops.id'), primary_key=True),
        sa.Column('store_id', UUID(as_uuid=True), sa.ForeignKey('stores.id'), primary_key=True),
        sa.Column('local_release_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('allocation', sa.Integer, nullable=True),
        sa.Column('release_method', sa.String(50), nullable=True),
        sa.Column('registration_url', sa.String(500), nullable=True),
        sa.Column('is_confirmed', sa.Boolean, nullable=False, default=False),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('source', sa.String(100), nullable=True),
        sa.Column('confidence_score', sa.Integer, nullable=False, default=50)
    )
    
    # Add foreign key constraints for signals
    op.create_foreign_key('fk_signals_store', 'signals', 'stores', ['store_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_signals_drop', 'signals', 'drops', ['drop_id'], ['id'], ondelete='SET NULL')
    
    # Create indexes for signals
    op.create_index('ix_signals_geohash', 'signals', ['geohash'])
    op.create_index('ix_signals_geohash_time', 'signals', ['geohash', 'created_at'])
    op.create_index('ix_signals_type_time', 'signals', ['signal_type', 'created_at'])
    op.create_index('ix_signals_city_time', 'signals', ['city', 'created_at'])
    op.create_index('ix_signals_user_time', 'signals', ['user_id', 'created_at'])
    op.create_index('ix_signals_reputation', 'signals', ['reputation_score'])
    op.create_index('ix_signals_brand_time', 'signals', ['brand', 'created_at'])
    op.create_index('ix_signals_visibility_time', 'signals', ['visibility', 'created_at'])
    op.create_index('ix_signals_dedupe', 'signals', ['dedupe_hash'])
    
    # Create indexes for stores
    op.create_index('ix_stores_city', 'stores', ['city'])
    op.create_index('ix_stores_slug', 'stores', ['slug'])
    op.create_index('ix_stores_city_retailer', 'stores', ['city', 'retailer_type'])
    op.create_index('ix_stores_retailer_active', 'stores', ['retailer_type', 'is_active'])
    op.create_index('ix_stores_name_search', 'stores', [sa.func.lower(sa.column('name'))])
    
    # Create indexes for drops
    op.create_index('ix_drops_brand', 'drops', ['brand'])
    op.create_index('ix_drops_sku', 'drops', ['sku'])
    op.create_index('ix_drops_release_at', 'drops', ['release_at'])
    op.create_index('ix_drops_status', 'drops', ['status'])
    op.create_index('ix_drops_brand_release', 'drops', ['brand', 'release_at'])
    op.create_index('ix_drops_status_release', 'drops', ['status', 'release_at'])
    op.create_index('ix_drops_hype_release', 'drops', ['hype_score', 'release_at'])
    op.create_index('ix_drops_featured_release', 'drops', ['is_featured', 'release_at'])
    op.create_index('ix_drops_external', 'drops', ['original_source', 'external_id'])
    
    # Create GIN indexes for array columns
    op.execute('CREATE INDEX ix_signals_tags ON signals USING GIN (tags)')
    op.execute('CREATE INDEX ix_stores_features ON stores USING GIN (features)')
    op.execute('CREATE INDEX ix_drops_regions ON drops USING GIN (regions)')
    
    # Create spatial GIST indexes for geography columns
    op.execute('CREATE INDEX ix_signals_geom ON signals USING GIST (geom)')
    op.execute('CREATE INDEX ix_stores_geom ON stores USING GIST (geom)')
    
    # Add check constraints
    op.create_check_constraint('positive_reputation', 'signals', 'reputation_score >= 0')
    op.create_check_constraint('positive_boost_count', 'signals', 'boost_count >= 0')
    op.create_check_constraint('positive_view_count', 'signals', 'view_count >= 0')
    op.create_check_constraint('positive_reply_count', 'signals', 'reply_count >= 0')
    
    op.create_check_constraint('positive_signal_count_stores', 'stores', 'signal_count >= 0')
    
    op.create_check_constraint('positive_hype_score', 'drops', 'hype_score >= 0')
    op.create_check_constraint('positive_interest_count', 'drops', 'interest_count >= 0')
    op.create_check_constraint('positive_signal_count_drops', 'drops', 'signal_count >= 0')
    op.create_check_constraint('positive_retail_price', 'drops', 'retail_price >= 0')


def downgrade():
    """Remove Sprint 1 models"""
    
    # Drop check constraints
    op.drop_constraint('positive_retail_price', 'drops')
    op.drop_constraint('positive_signal_count_drops', 'drops')
    op.drop_constraint('positive_interest_count', 'drops')
    op.drop_constraint('positive_hype_score', 'drops')
    
    op.drop_constraint('positive_signal_count_stores', 'stores')
    
    op.drop_constraint('positive_reply_count', 'signals')
    op.drop_constraint('positive_view_count', 'signals')
    op.drop_constraint('positive_boost_count', 'signals')
    op.drop_constraint('positive_reputation', 'signals')
    
    # Drop spatial GIST indexes
    op.drop_index('ix_stores_geom', 'stores')
    op.drop_index('ix_signals_geom', 'signals')
    
    # Drop GIN indexes
    op.drop_index('ix_drops_regions', 'drops')
    op.drop_index('ix_stores_features', 'stores')
    op.drop_index('ix_signals_tags', 'signals')
    
    # Drop indexes for drops
    op.drop_index('ix_drops_external', 'drops')
    op.drop_index('ix_drops_featured_release', 'drops')
    op.drop_index('ix_drops_hype_release', 'drops')
    op.drop_index('ix_drops_status_release', 'drops')
    op.drop_index('ix_drops_brand_release', 'drops')
    op.drop_index('ix_drops_status', 'drops')
    op.drop_index('ix_drops_release_at', 'drops')
    op.drop_index('ix_drops_sku', 'drops')
    op.drop_index('ix_drops_brand', 'drops')
    
    # Drop indexes for stores
    op.drop_index('ix_stores_name_search', 'stores')
    op.drop_index('ix_stores_retailer_active', 'stores')
    op.drop_index('ix_stores_city_retailer', 'stores')
    op.drop_index('ix_stores_slug', 'stores')
    op.drop_index('ix_stores_city', 'stores')
    
    # Drop indexes for signals
    op.drop_index('ix_signals_dedupe', 'signals')
    op.drop_index('ix_signals_visibility_time', 'signals')
    op.drop_index('ix_signals_brand_time', 'signals')
    op.drop_index('ix_signals_reputation', 'signals')
    op.drop_index('ix_signals_user_time', 'signals')
    op.drop_index('ix_signals_city_time', 'signals')
    op.drop_index('ix_signals_type_time', 'signals')
    op.drop_index('ix_signals_geohash_time', 'signals')
    op.drop_index('ix_signals_geohash', 'signals')
    
    # Drop foreign key constraints
    op.drop_constraint('fk_signals_drop', 'signals')
    op.drop_constraint('fk_signals_store', 'signals')
    
    # Drop tables
    op.drop_table('drop_stores')
    op.drop_table('drops')
    op.drop_table('stores')
    op.drop_table('signals')
    
    # Drop enums
    retailer_type_enum = sa.Enum(name='retailer_type_enum')
    retailer_type_enum.drop(op.get_bind())
    
    drop_status_enum = sa.Enum(name='drop_status_enum')
    drop_status_enum.drop(op.get_bind())
    
    signal_type_enum = sa.Enum(name='signal_type_enum')
    signal_type_enum.drop(op.get_bind())
    
    # Note: visibility_enum might be used by other tables, so we don't drop it