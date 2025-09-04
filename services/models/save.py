
import uuid
from sqlalchemy import Column, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from services.database import Base

class Save(Base):
    __tablename__ = "saves"

    save_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.post_id"), nullable=False)
    board_id = Column(UUID(as_uuid=True), nullable=True) # For future use, e.g. saving to a specific board
    created_at = Column(DateTime(timezone=True), server_default=func.now())

