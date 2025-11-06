import uuid
import hashlib
from datetime import datetime, timedelta
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from services.database import Base

class UserSession(Base):
    __tablename__ = 'user_sessions'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id', ondelete="CASCADE"), nullable=False)
    refresh_token_hash = Column(String(255), nullable=False, unique=True)
    device_fingerprint = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)  # Support IPv6
    user_agent = Column(String(500), nullable=True)
    
    # Session management
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_used_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Security flags
    is_revoked = Column(String(1), nullable=False, default='0')  # '0' = active, '1' = revoked
    revoked_reason = Column(String(100), nullable=True)  # 'logout', 'security', 'expired'
    
    # Relationships
    user = relationship("User", backref="sessions")
    
    # Indexes for performance
    __table_args__ = (
        Index('ix_sessions_user_active', user_id, is_revoked),
        Index('ix_sessions_token_hash', refresh_token_hash),
        Index('ix_sessions_expires', expires_at),
    )
    
    @classmethod
    def create_device_fingerprint(cls, ip_address: str, user_agent: str) -> str:
        """Create a simple device fingerprint from IP and User-Agent"""
        if not ip_address or not user_agent:
            return "unknown"
        
        fingerprint_data = f"{ip_address}:{user_agent}"
        return hashlib.sha256(fingerprint_data.encode()).hexdigest()[:32]
    
    @classmethod
    def hash_refresh_token(cls, token: str) -> str:
        """Hash refresh token for secure storage"""
        return hashlib.sha256(token.encode()).hexdigest()
    
    def is_expired(self) -> bool:
        """Check if session is expired"""
        return datetime.now(timezone.utc) > self.expires_at
    
    def is_active(self) -> bool:
        """Check if session is active (not revoked and not expired)"""
        return self.is_revoked == '0' and not self.is_expired()
    
    def revoke(self, reason: str = "logout"):
        """Revoke the session"""
        self.is_revoked = '1'
        self.revoked_reason = reason