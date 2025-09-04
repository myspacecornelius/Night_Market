
import uuid
from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from services.database import Base

class Repost(Base):
    __tablename__ = "reposts"

    repost_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.post_id"), nullable=False)

