from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from services.database import Base


class QuestClaim(Base):
    """A quest reward a user has collected.

    The primary key is what makes a reward claimable once: one row per user, quest
    and period ("2026-11-11" for a daily quest, "2026-W46" for a weekly one).
    """
    __tablename__ = 'quest_claims'

    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id', ondelete="CASCADE"), primary_key=True)
    quest_id = Column(String(64), primary_key=True)
    period_key = Column(String(32), primary_key=True)
    reward = Column(Integer, nullable=False)
    claimed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
