import uuid
from sqlalchemy import Column, String, Integer, DateTime, Float, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from services.database import Base

class HeatMapTile(Base):
    __tablename__ = 'heat_map_tiles'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    geohash = Column(String(12), nullable=False, index=True)
    precision = Column(Integer, nullable=False)
    time_window = Column(String(10), nullable=False)  # '1h', '24h', '7d'
    
    # Aggregated data
    signal_count = Column(Integer, nullable=False, default=0)
    post_count = Column(Integer, nullable=False, default=0)
    total_boost_score = Column(Integer, nullable=False, default=0)
    
    # Geographic center
    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)
    
    # Top data samples
    top_brands = Column(JSON, nullable=True)  # [{"brand": "nike", "count": 5}, ...]
    top_tags = Column(JSON, nullable=True)    # ["jordan", "dunk", "yeezy"]
    sample_posts = Column(JSON, nullable=True)  # [{post_id, content, timestamp}, ...]
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    
    __table_args__ = (
        Index('ix_heatmap_geohash_window', geohash, time_window),
        Index('ix_heatmap_precision_expires', precision, expires_at),
        Index('ix_heatmap_expires', expires_at),
    )
    
    @classmethod
    def get_cache_key(cls, geohash: str, precision: int, time_window: str) -> str:
        """Generate cache key for tile lookup"""
        return f"heatmap:{precision}:{time_window}:{geohash}"
    
    def to_dict(self):
        """Convert tile to API response format"""
        return {
            "geohash": self.geohash,
            "lat": self.center_lat,
            "lng": self.center_lng,
            "signal_count": self.signal_count,
            "post_count": self.post_count,
            "boost_score": self.total_boost_score,
            "top_brands": self.top_brands or [],
            "top_tags": self.top_tags or [],
            "sample_posts": self.sample_posts or []
        }