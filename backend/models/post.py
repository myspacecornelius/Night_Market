
import uuid
from sqlalchemy import Column, String, Enum, ForeignKey, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from backend.database import Base

class Post(Base):
    __tablename__ = "posts"

    post_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    post_type = Column(Enum('SPOTTED', 'STOCK_CHECK', 'LINE_UPDATE', 'GENERAL', name='post_type_enum'), nullable=False)
    content_text = Column(String, nullable=True)
    media_url = Column(String, nullable=True)
    tags = Column(ARRAY(String), nullable=True)
    boost_score = Column(Integer, default=0)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    visibility = Column(Enum('public', 'local', 'friends', name='visibility_enum'), nullable=False, default='public')

