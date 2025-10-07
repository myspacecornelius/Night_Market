import uuid
import hashlib
from datetime import datetime, timedelta
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Enum, Text, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from geoalchemy2 import Geography
from services.database import Base
import geohash2

class SignalType:
    """Signal type constants"""
    SPOTTED = 'SPOTTED'                    # "Just saw Jordan 4s at Footlocker downtown"
    STOCK_CHECK = 'STOCK_CHECK'            # "Anyone know if Nike has the Dunk Low?"
    LINE_UPDATE = 'LINE_UPDATE'            # "Line is 50 deep at Supreme"
    INTEL_REPORT = 'INTEL_REPORT'          # "Employee says restock tomorrow"
    HEAT_CHECK = 'HEAT_CHECK'              # "Are these worth copping?"
    DROP_ALERT = 'DROP_ALERT'              # "YZY just dropped on Adidas app"
    GENERAL = 'GENERAL'                    # "Anyone camping tonight?"

class Signal(Base):
    __tablename__ = 'signals'
    
    # Core identity
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id', ondelete="CASCADE"), nullable=False, index=True)
    
    # Geospatial data - core to the signal
    geom = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    geohash = Column(String(12), nullable=False, index=True)  # Auto-generated from geom
    city = Column(String(100), nullable=True, index=True)     # For city-based filtering
    
    # Signal content
    signal_type = Column(
        Enum('SPOTTED', 'STOCK_CHECK', 'LINE_UPDATE', 'INTEL_REPORT', 'HEAT_CHECK', 'DROP_ALERT', 'GENERAL', 
             name='signal_type_enum'), 
        nullable=False, index=True
    )
    text_content = Column(Text, nullable=True)
    media_url = Column(String(500), nullable=True)
    
    # Structured data references
    store_id = Column(UUID(as_uuid=True), ForeignKey('stores.id', ondelete="SET NULL"), nullable=True)
    drop_id = Column(UUID(as_uuid=True), ForeignKey('drops.id', ondelete="SET NULL"), nullable=True)
    
    # Community engagement
    reputation_score = Column(Integer, default=0, nullable=False)  # Community-driven trust score
    boost_count = Column(Integer, default=0, nullable=False)       # Number of boosts received
    view_count = Column(Integer, default=0, nullable=False)        # View tracking
    reply_count = Column(Integer, default=0, nullable=False)       # Comment count
    
    # Tags and metadata
    tags = Column(ARRAY(String), nullable=True)                   # ["jordan4", "footlocker", "restock"]
    brand = Column(String(100), nullable=True, index=True)        # "Nike", "Adidas", "Jordan"
    product_sku = Column(String(100), nullable=True)              # "DZ5485-612"
    
    # Deduplication and quality control
    dedupe_hash = Column(String(64), nullable=True, index=True)   # For duplicate detection
    is_verified = Column(Boolean, default=False, nullable=False) # Mod-verified accuracy
    is_flagged = Column(Boolean, default=False, nullable=False)  # Community-flagged content
    
    # Temporal data
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)   # For time-sensitive signals
    
    # Privacy and visibility
    visibility = Column(
        Enum('public', 'local', 'followers', 'private', name='visibility_enum'), 
        nullable=False, default='public'
    )
    
    # Relationships
    user = relationship("User", back_populates="signals")
    # store = relationship("Store")  # Will create when Store model exists
    # drop = relationship("Drop")    # Will create when Drop model exists
    
    # Constraints and Indexes
    __table_args__ = (
        # Performance indexes
        Index('ix_signals_geom', geom, postgresql_using='gist'),
        Index('ix_signals_geohash_time', geohash, created_at.desc()),
        Index('ix_signals_type_time', signal_type, created_at.desc()),
        Index('ix_signals_city_time', city, created_at.desc()),
        Index('ix_signals_user_time', user_id, created_at.desc()),
        Index('ix_signals_reputation', reputation_score.desc()),
        Index('ix_signals_brand_time', brand, created_at.desc()),
        
        # Composite indexes for common queries
        Index('ix_signals_visibility_time', visibility, created_at.desc()),
        Index('ix_signals_active', visibility, is_flagged, expires_at),
        
        # Data quality constraints
        CheckConstraint('reputation_score >= 0', name='positive_reputation'),
        CheckConstraint('boost_count >= 0', name='positive_boost_count'),
        CheckConstraint('view_count >= 0', name='positive_view_count'),
        CheckConstraint('reply_count >= 0', name='positive_reply_count'),
    )
    
    @classmethod
    def generate_geohash(cls, latitude: float, longitude: float, precision: int = 7) -> str:
        """Generate geohash from coordinates"""
        return geohash2.encode(latitude, longitude, precision=precision)
    
    @classmethod
    def generate_dedupe_hash(cls, user_id: str, geohash: str, signal_type: str, text_content: str = None) -> str:
        """Generate hash for duplicate detection"""
        # Create hash from user, location (geohash precision 5), type, and content
        geohash_coarse = geohash[:5] if geohash else ""
        content_preview = (text_content or "")[:100].lower().strip()
        
        dedupe_string = f"{user_id}:{geohash_coarse}:{signal_type}:{content_preview}"
        return hashlib.sha256(dedupe_string.encode()).hexdigest()
    
    def set_coordinates(self, latitude: float, longitude: float):
        """Set coordinates and auto-generate geohash"""
        # PostGIS point creation will be handled by SQLAlchemy
        self.geohash = self.generate_geohash(latitude, longitude)
    
    def generate_dedupe_hash_for_instance(self):
        """Generate dedupe hash for this signal instance"""
        self.dedupe_hash = self.generate_dedupe_hash(
            str(self.user_id),
            self.geohash,
            self.signal_type,
            self.text_content
        )
    
    def is_expired(self) -> bool:
        """Check if signal has expired"""
        if not self.expires_at:
            return False
        return datetime.utcnow() > self.expires_at
    
    def is_active(self) -> bool:
        """Check if signal is active (not flagged, not expired, visible)"""
        return (
            not self.is_flagged and 
            not self.is_expired() and 
            self.visibility in ['public', 'local']
        )
    
    def boost(self):
        """Increment boost count"""
        self.boost_count += 1
        self.reputation_score += 2  # Boosts increase reputation
    
    def flag(self):
        """Flag signal for review"""
        self.is_flagged = True
        self.reputation_score -= 5  # Flagging hurts reputation
    
    def verify(self):
        """Mark signal as verified by moderator"""
        self.is_verified = True
        self.is_flagged = False
        self.reputation_score += 10  # Verification boosts reputation
    
    def to_geojson_feature(self) -> dict:
        """Convert signal to GeoJSON feature for mapping"""
        return {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [
                    float(self.geom.longitude) if hasattr(self.geom, 'longitude') else 0,
                    float(self.geom.latitude) if hasattr(self.geom, 'latitude') else 0
                ]
            },
            "properties": {
                "id": str(self.id),
                "signal_type": self.signal_type,
                "text_content": self.text_content,
                "reputation_score": self.reputation_score,
                "boost_count": self.boost_count,
                "tags": self.tags,
                "brand": self.brand,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "is_verified": self.is_verified
            }
        }