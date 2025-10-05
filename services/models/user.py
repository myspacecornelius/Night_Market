
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, Index, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from services.database import Base

class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    username = Column(String(50), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    location = Column(String(100), nullable=True)
    home_city = Column(String(100), nullable=True)
    privacy_level = Column(Enum('public', 'pseudonymous', 'anon', name='privacy_level_enum'), nullable=False, default='public')
    website_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_active_at = Column(DateTime(timezone=True), server_default=func.now())
    is_anonymous = Column(Boolean, default=False, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    laces_balance = Column(Integer, default=100, nullable=False)
    total_posts = Column(Integer, default=0, nullable=False)
    total_boosts_sent = Column(Integer, default=0, nullable=False)
    total_boosts_received = Column(Integer, default=0, nullable=False)
    
    # Relationships
    posts = relationship("Post", back_populates="user", cascade="all, delete-orphan")
    laces_transactions = relationship("LacesLedger", back_populates="user", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('ix_users_created_at', created_at),
        Index('ix_users_laces_balance', laces_balance.desc()),
    )

