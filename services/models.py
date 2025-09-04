from sqlalchemy import Column, String, Integer, ForeignKey, Enum, DateTime, JSON, Float
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime
from services.database import Base  # SQLAlchemy setup

class ContentType(enum.Enum):
    text = "text"
    image = "image"
    video = "video"

class Visibility(enum.Enum):
    public = "public"
    local = "local"
    friends = "friends"

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False)
    display_name = Column(String)
    avatar_url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class Post(Base):
    __tablename__ = "posts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content_type = Column(Enum(ContentType), nullable=False)
    content_text = Column(String, nullable=True)
    media_url = Column(String, nullable=True)
    tags = Column(ARRAY(String), nullable=True)
    geo_lat = Column(Float, nullable=True)
    geo_lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    visibility = Column(Enum(Visibility), default=Visibility.public)

    user = relationship("User", back_populates="posts")

User.posts = relationship("Post", order_by=Post.created_at, back_populates="user")
