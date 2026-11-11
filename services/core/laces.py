"""LACES ledger operations.

Every balance change goes through :func:`apply_laces`, which changes
``users.laces_balance`` with a single guarded UPDATE and writes the matching
ledger row in the same transaction. Nothing in this module commits: the caller
owns the transaction, so a multi-step operation (a boost debits one user and
credits another) is all-or-nothing.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from services.models.dropzone import DropZoneCheckIn
from services.models.laces import LacesLedger
from services.models.post import Post
from services.models.user import User

DAILY_STIPEND = 100
DEFAULT_BOOST_AMOUNT = 10
BOOST_AUTHOR_SHARE = 0.5


class LacesError(Exception):
    """A LACES operation that cannot be carried out; the message is safe to show."""


class InsufficientLaces(LacesError):
    pass


class UnknownUser(LacesError):
    pass


def apply_laces(
    db: Session,
    user_id: UUID,
    amount: int,
    transaction_type: str,
    *,
    related_post_id: Optional[UUID] = None,
    description: Optional[str] = None,
    reference_id: Optional[str] = None,
) -> LacesLedger:
    """Credit (amount > 0) or debit (amount < 0) a user and record it.

    A debit only succeeds while the balance covers it; the check and the change
    are one UPDATE, so concurrent debits cannot overdraw the account.
    """
    if amount == 0:
        raise LacesError("Amount must not be zero")

    statement = update(User).where(User.user_id == user_id)
    if amount < 0:
        statement = statement.where(User.laces_balance >= -amount)
    statement = statement.values(laces_balance=User.laces_balance + amount).returning(User.laces_balance)

    new_balance = db.execute(statement).scalar_one_or_none()
    if new_balance is None:
        if db.get(User, user_id) is None:
            raise UnknownUser("User not found")
        raise InsufficientLaces("Insufficient LACES balance")

    entry = LacesLedger(
        user_id=user_id,
        amount=amount,
        transaction_type=transaction_type,
        related_post_id=related_post_id,
        description=description,
        reference_id=reference_id,
        balance_after=new_balance,
    )
    db.add(entry)
    db.flush()
    return entry


def start_of_utc_day(moment: Optional[datetime] = None) -> datetime:
    moment = moment or datetime.now(timezone.utc)
    return moment.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def stipend_claimed_today(db: Session, user_id: UUID) -> bool:
    return (
        db.query(LacesLedger.id)
        .filter(
            LacesLedger.user_id == user_id,
            LacesLedger.transaction_type == "DAILY_STIPEND",
            LacesLedger.created_at >= start_of_utc_day(),
        )
        .first()
        is not None
    )


def claim_daily_stipend(db: Session, user_id: UUID) -> LacesLedger:
    """Grant today's stipend once per UTC day.

    The user row is locked first so two simultaneous claims are checked one
    after the other instead of both seeing "not claimed yet".
    """
    locked = db.query(User.user_id).filter(User.user_id == user_id).with_for_update().first()
    if locked is None:
        raise UnknownUser("User not found")
    if stipend_claimed_today(db, user_id):
        raise LacesError("Daily stipend already claimed")
    return apply_laces(db, user_id, DAILY_STIPEND, "DAILY_STIPEND", description="Daily LACES stipend")


def distribute_daily_stipends(db: Session, active_within_days: int = 7) -> int:
    """Grant today's stipend to active users who posted or checked in recently and have not claimed it.

    Each grant goes through claim_daily_stipend in its own savepoint, so one
    failure does not undo the others. Returns how many users were credited.
    Does not commit.
    """
    since = datetime.now(timezone.utc) - timedelta(days=active_within_days)
    recent_posters = select(Post.user_id).where(Post.timestamp >= since)
    recent_visitors = select(DropZoneCheckIn.user_id).where(DropZoneCheckIn.checked_in_at >= since)
    claimed_today = select(LacesLedger.user_id).where(
        LacesLedger.transaction_type == "DAILY_STIPEND",
        LacesLedger.created_at >= start_of_utc_day(),
    )
    user_ids = db.scalars(
        select(User.user_id).where(
            User.is_active.is_(True),
            or_(User.user_id.in_(recent_posters), User.user_id.in_(recent_visitors)),
            User.user_id.not_in(claimed_today),
        )
    ).all()

    granted = 0
    for user_id in user_ids:
        try:
            with db.begin_nested():
                claim_daily_stipend(db, user_id)
            granted += 1
        except LacesError:
            continue  # claimed in the meantime
    return granted


def boost_post(db: Session, post_id: UUID, booster_id: UUID, amount: int = DEFAULT_BOOST_AMOUNT) -> dict:
    """Spend ``amount`` LACES boosting someone else's post.

    The booster is debited, the author receives half (rounded down), and the
    post's boost score rises by ``amount``.
    """
    if amount < 1:
        raise LacesError("Boost amount must be at least 1")

    post = db.get(Post, post_id)
    if post is None:
        raise LookupError("Post not found")
    if post.user_id == booster_id:
        raise LacesError("Cannot boost your own post")

    sent = apply_laces(
        db, booster_id, -amount, "BOOST_SENT",
        related_post_id=post_id, description=f"Boosted post with {amount} LACES",
    )
    db.execute(
        update(User).where(User.user_id == booster_id).values(total_boosts_sent=User.total_boosts_sent + 1)
    )

    author_reward = int(amount * BOOST_AUTHOR_SHARE)
    if author_reward > 0:
        apply_laces(
            db, post.user_id, author_reward, "BOOST_RECEIVED",
            related_post_id=post_id, description=f"Received {author_reward} LACES from post boost",
        )
    db.execute(
        update(User).where(User.user_id == post.user_id).values(total_boosts_received=User.total_boosts_received + 1)
    )

    new_score = db.execute(
        update(Post).where(Post.post_id == post_id).values(boost_score=Post.boost_score + amount).returning(Post.boost_score)
    ).scalar_one()

    return {
        "boost_amount": amount,
        "author_reward": author_reward,
        "new_boost_score": new_score,
        "remaining_balance": sent.balance_after,
    }
