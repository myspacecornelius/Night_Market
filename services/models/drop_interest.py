import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from services.database import Base


class DropInterest(Base):
    """A user following a drop: one row per user and drop.

    ``drops.interest_count`` used to be a bare counter that every request
    incremented, so one person could inflate it and nobody could be told about
    "their" drops. The counter is now the number of these rows.
    """
    __tablename__ = 'drop_interests'

    drop_id = Column(UUID(as_uuid=True), ForeignKey('drops.id', ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id', ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index('ix_drop_interests_user_id', user_id),
    )
