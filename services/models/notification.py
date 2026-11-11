import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from services.database import Base


class Notification(Base):
    """A message for one user, shown in the app until they read it."""
    __tablename__ = 'notifications'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id', ondelete="CASCADE"), nullable=False)
    kind = Column(String(50), nullable=False)  # e.g. 'drop_reminder', 'quest_completed'
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String(500), nullable=True)  # a path inside the web app, e.g. /drops
    # Set by whatever creates the notification so the same event is only announced
    # once per user (e.g. "drop:<id>:24h"). NULL means no de-duplication.
    dedupe_key = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index('ix_notifications_user_created', user_id, created_at.desc()),
        Index('uq_notifications_user_dedupe', user_id, dedupe_key, unique=True),
    )
