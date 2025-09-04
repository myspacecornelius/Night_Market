import uuid
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Text, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from services.database import Base

class LacesLedger(Base):
    __tablename__ = 'laces_ledger'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id', ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)
    transaction_type = Column(
        Enum('DAILY_STIPEND', 'BOOST_SENT', 'BOOST_RECEIVED', 'SIGNAL_REWARD', 'ADMIN_ADD', 'ADMIN_REMOVE', 
             'PURCHASE', 'REFUND', 'CONTEST_REWARD', name='transaction_type_enum'), 
        nullable=False
    )
    related_post_id = Column(UUID(as_uuid=True), ForeignKey('posts.post_id', ondelete="SET NULL"), nullable=True)
    description = Column(Text, nullable=True)
    reference_id = Column(String(100), nullable=True)  # External reference for tracking
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="laces_transactions")
    post = relationship("Post", back_populates="laces_transactions")
    
    # Constraints and Indexes
    __table_args__ = (
        CheckConstraint('amount != 0', name='non_zero_amount'),
        Index('ix_laces_user_created', user_id, created_at.desc()),
        Index('ix_laces_type_created', transaction_type, created_at.desc()),
        Index('ix_laces_amount', amount),
    )
