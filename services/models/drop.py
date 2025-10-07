import uuid
from datetime import datetime
from typing import List
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, DECIMAL, JSON, Index, CheckConstraint, Enum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from services.database import Base

class DropStatus:
    """Drop status constants"""
    UPCOMING = 'upcoming'
    LIVE = 'live'
    SOLD_OUT = 'sold_out'
    DELAYED = 'delayed'
    CANCELLED = 'cancelled'
    ENDED = 'ended'

class Drop(Base):
    __tablename__ = 'drops'
    
    # Core identity
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Product information
    brand = Column(String(100), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # Release details
    release_at = Column(DateTime(timezone=True), nullable=True, index=True)
    retail_price = Column(DECIMAL(10, 2), nullable=True)
    estimated_stock = Column(Integer, nullable=True)
    
    # Media and content
    image_url = Column(String(500), nullable=True)
    images = Column(ARRAY(String), nullable=True)  # Multiple product images
    
    # Status and metadata
    status = Column(
        Enum('upcoming', 'live', 'sold_out', 'delayed', 'cancelled', 'ended', name='drop_status_enum'),
        nullable=False, default='upcoming', index=True
    )
    
    # Geographic and channel information
    regions = Column(ARRAY(String), nullable=True)  # ['US', 'EU', 'ASIA']
    release_type = Column(String(50), nullable=True)  # 'FCFS', 'RAFFLE', 'SHOCK_DROP', 'EXCLUSIVE'
    
    # External links and data
    links = Column(JSON, nullable=True)  # {official_url, raffle_links, purchase_links}
    original_source = Column(String(100), nullable=True)  # 'SNKRS', 'Shopify', 'Manual'
    external_id = Column(String(100), nullable=True)  # ID from external source
    
    # Community engagement
    hype_score = Column(Integer, default=0, nullable=False)  # Community-driven hype rating
    interest_count = Column(Integer, default=0, nullable=False)  # Number of users interested
    signal_count = Column(Integer, default=0, nullable=False)  # Related signals count
    
    # Temporal tracking
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_checked_at = Column(DateTime(timezone=True), nullable=True)  # Last external sync
    
    # Admin flags
    is_featured = Column(Boolean, default=False, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)  # Confirmed by multiple sources
    
    # Relationships
    stores = relationship("Store", secondary="drop_stores", back_populates="drops")
    # signals = relationship("Signal", back_populates="drop")  # Will add when Signal is integrated
    
    # Constraints and Indexes
    __table_args__ = (
        # Performance indexes
        Index('ix_drops_brand_release', brand, release_at),
        Index('ix_drops_status_release', status, release_at),
        Index('ix_drops_hype_release', hype_score.desc(), release_at),
        Index('ix_drops_regions', regions, postgresql_using='gin'),
        Index('ix_drops_featured_release', is_featured, release_at.desc()),
        
        # Search indexes
        Index('ix_drops_name_search', func.lower(name), postgresql_using='gin'),
        Index('ix_drops_external', original_source, external_id),
        
        # Data quality constraints
        CheckConstraint('hype_score >= 0', name='positive_hype_score'),
        CheckConstraint('interest_count >= 0', name='positive_interest_count'),
        CheckConstraint('signal_count >= 0', name='positive_signal_count'),
        CheckConstraint('retail_price >= 0', name='positive_retail_price'),
    )
    
    def is_upcoming(self) -> bool:
        """Check if drop is upcoming"""
        return self.status == DropStatus.UPCOMING and (
            not self.release_at or self.release_at > datetime.utcnow()
        )
    
    def is_live(self) -> bool:
        """Check if drop is currently live"""
        return self.status == DropStatus.LIVE
    
    def is_available(self) -> bool:
        """Check if drop is available for purchase"""
        return self.status in [DropStatus.UPCOMING, DropStatus.LIVE]
    
    def add_interest(self):
        """Increment interest count"""
        self.interest_count += 1
        self.hype_score += 1
    
    def add_signal(self):
        """Increment signal count when a signal references this drop"""
        self.signal_count += 1
        self.hype_score += 2  # Signals add more hype than interest
    
    def update_status_from_signals(self):
        """Update drop status based on recent signals (called by workers)"""
        # This would analyze recent signals to detect status changes
        # e.g., "sold out" signals -> update status to SOLD_OUT
        pass
    
    def get_time_until_drop(self) -> dict:
        """Get time remaining until drop"""
        if not self.release_at:
            return {"status": "no_date"}
        
        now = datetime.utcnow()
        if self.release_at <= now:
            return {"status": "live_or_past"}
        
        delta = self.release_at - now
        return {
            "status": "upcoming",
            "days": delta.days,
            "hours": delta.seconds // 3600,
            "minutes": (delta.seconds % 3600) // 60,
            "total_seconds": int(delta.total_seconds())
        }
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses"""
        return {
            "id": str(self.id),
            "brand": self.brand,
            "sku": self.sku,
            "name": self.name,
            "description": self.description,
            "release_at": self.release_at.isoformat() if self.release_at else None,
            "retail_price": float(self.retail_price) if self.retail_price else None,
            "image_url": self.image_url,
            "status": self.status,
            "regions": self.regions,
            "release_type": self.release_type,
            "links": self.links,
            "hype_score": self.hype_score,
            "interest_count": self.interest_count,
            "signal_count": self.signal_count,
            "is_featured": self.is_featured,
            "is_verified": self.is_verified,
            "time_until_drop": self.get_time_until_drop(),
            "store_count": len(self.stores) if self.stores else 0
        }

class Store(Base):
    __tablename__ = 'stores'
    
    # Core identity
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    
    # Location data
    geom = Column(String, nullable=False)  # PostGIS POINT - using string for now, will convert to Geography
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=False, index=True)
    state = Column(String(50), nullable=True)
    country = Column(String(50), nullable=False, default='US')
    postal_code = Column(String(20), nullable=True)
    
    # Store classification
    retailer_type = Column(
        Enum('NIKE', 'ADIDAS', 'FOOTLOCKER', 'FINISH_LINE', 'CHAMPS', 'FOOTACTION', 
             'JD_SPORTS', 'SNEAKERSNSTUFF', 'END', 'SIZE', 'BOUTIQUE', 'CONSIGNMENT', 
             'OTHER', name='retailer_type_enum'),
        nullable=False, index=True
    )
    
    # Store details
    phone = Column(String(20), nullable=True)
    website_url = Column(String(500), nullable=True)
    social_links = Column(JSON, nullable=True)  # {instagram, twitter, etc}
    
    # Operating information
    open_hours = Column(JSON, nullable=True)  # Weekly schedule
    timezone = Column(String(50), nullable=True)
    
    # Store features and policies
    features = Column(ARRAY(String), nullable=True)  # ['FCFS', 'RAFFLE', 'RESERVATION', 'APP_ONLY']
    release_methods = Column(ARRAY(String), nullable=True)  # How they handle releases
    
    # Community and verification
    is_verified = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    signal_count = Column(Integer, default=0, nullable=False)  # Signals from this store
    
    # External integration
    external_ids = Column(JSON, nullable=True)  # {nike_store_id, footlocker_id, etc}
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    drops = relationship("Drop", secondary="drop_stores", back_populates="stores")
    # signals = relationship("Signal", back_populates="store")  # Will add when Signal is integrated
    
    # Constraints and Indexes
    __table_args__ = (
        # Geospatial indexes (will convert to proper PostGIS later)
        Index('ix_stores_city_retailer', city, retailer_type),
        Index('ix_stores_retailer_active', retailer_type, is_active),
        Index('ix_stores_features', features, postgresql_using='gin'),
        
        # Search indexes
        Index('ix_stores_name_search', func.lower(name)),
        
        # Data quality constraints
        CheckConstraint('signal_count >= 0', name='positive_signal_count'),
    )
    
    def add_signal(self):
        """Increment signal count when a signal references this store"""
        self.signal_count += 1
    
    def is_open_now(self) -> bool:
        """Check if store is currently open (simplified)"""
        # This would check current time against open_hours
        # For now, just return True for active stores
        return self.is_active
    
    def get_release_methods_display(self) -> List[str]:
        """Get human-readable release methods"""
        if not self.release_methods:
            return ["Unknown"]
        
        method_map = {
            "FCFS": "First Come First Serve",
            "RAFFLE": "Raffle Entry",
            "RESERVATION": "Reservation System",
            "APP_ONLY": "App Exclusive",
            "ONLINE_ONLY": "Online Only"
        }
        
        return [method_map.get(method, method) for method in self.release_methods]
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses"""
        return {
            "id": str(self.id),
            "name": self.name,
            "slug": self.slug,
            "address": self.address,
            "city": self.city,
            "state": self.state,
            "country": self.country,
            "retailer_type": self.retailer_type,
            "phone": self.phone,
            "website_url": self.website_url,
            "features": self.features,
            "release_methods": self.get_release_methods_display(),
            "is_verified": self.is_verified,
            "is_active": self.is_active,
            "signal_count": self.signal_count,
            "drop_count": len(self.drops) if self.drops else 0
        }

# Association table for many-to-many relationship between drops and stores
class DropStore(Base):
    __tablename__ = 'drop_stores'
    
    drop_id = Column(UUID(as_uuid=True), ForeignKey('drops.id'), primary_key=True)
    store_id = Column(UUID(as_uuid=True), ForeignKey('stores.id'), primary_key=True)
    
    # Store-specific drop information
    local_release_time = Column(DateTime(timezone=True), nullable=True)  # Store's local release time
    allocation = Column(Integer, nullable=True)  # Expected stock at this store
    release_method = Column(String(50), nullable=True)  # How this store is releasing
    registration_url = Column(String(500), nullable=True)  # Store-specific registration link
    
    # Status tracking
    is_confirmed = Column(Boolean, default=False, nullable=False)  # Confirmed by store
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Source tracking
    source = Column(String(100), nullable=True)  # How we learned about this drop at this store
    confidence_score = Column(Integer, default=50, nullable=False)  # 0-100 confidence in accuracy