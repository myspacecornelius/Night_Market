
import uuid
from sqlalchemy import Column, String, Enum, ForeignKey, DateTime, Integer, Text, Boolean, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from services.database import Base

class Post(Base):
    __tablename__ = "posts"

    post_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    post_type = Column(Enum('SPOTTED', 'STOCK_CHECK', 'LINE_UPDATE', 'GENERAL', 'HEAT_CHECK', 'INTEL_REPORT', name='post_type_enum'), nullable=False)
    content_text = Column(Text, nullable=True)
    media_url = Column(String(500), nullable=True)
    tags = Column(ARRAY(String), nullable=True)
    boost_score = Column(Integer, default=0, nullable=False)
    view_count = Column(Integer, default=0, nullable=False)
    reply_count = Column(Integer, default=0, nullable=False)
    repost_count = Column(Integer, default=0, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    visibility = Column(Enum('public', 'local', 'friends', 'private', name='visibility_enum'), nullable=False, default='public')
    is_pinned = Column(Boolean, default=False, nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="posts")
    location = relationship("Location")
    laces_transactions = relationship("LacesLedger", back_populates="post")
    
    # Constraints
    __table_args__ = (
        CheckConstraint('boost_score >= 0', name='positive_boost_score'),
        CheckConstraint('view_count >= 0', name='positive_view_count'),
        CheckConstraint('reply_count >= 0', name='positive_reply_count'),
        CheckConstraint('repost_count >= 0', name='positive_repost_count'),
        Index('ix_posts_timestamp', timestamp.desc()),
        Index('ix_posts_user_timestamp', user_id, timestamp.desc()),
        Index('ix_posts_location_timestamp', location_id, timestamp.desc()),
        Index('ix_posts_boost_score', boost_score.desc()),
        Index('ix_posts_type_timestamp', post_type, timestamp.desc()),
        Index('ix_posts_visibility_timestamp', visibility, timestamp.desc()),
    )

