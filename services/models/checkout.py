import uuid
from sqlalchemy import Column, String, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from services.database import Base

class CheckoutTaskResult(Base):
    __tablename__ = 'checkout_task_results'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id'), nullable=False, index=True)
    success = Column(Boolean, nullable=False)
    order_id = Column(String, nullable=True)
    error = Column(Text, nullable=True)
    product_url = Column(String, nullable=False)
    variant_id = Column(String, nullable=True)
    size = Column(String, nullable=True)
    retailer = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
