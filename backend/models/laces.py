import uuid
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from backend.database import Base

class LacesLedger(Base):
    __tablename__ = 'laces_ledger'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id'), nullable=False)
    amount = Column(Integer, nullable=False)
    transaction_type = Column(Enum('DAILY_STIPEND', 'BOOST_SENT', 'BOOST_RECEIVED', 'SIGNAL_REWARD', name='transaction_type_enum'), nullable=False)
    related_post_id = Column(UUID(as_uuid=True), ForeignKey('posts.post_id'), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
