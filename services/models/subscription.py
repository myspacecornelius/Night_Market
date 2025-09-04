
import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from services.database import Base

class Subscription(Base):
    __tablename__ = "subscriptions"

    subscription_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    brand = Column(String, nullable=True)
    release_id = Column(UUID(as_uuid=True), ForeignKey("releases.release_id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
