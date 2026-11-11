from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, UUID4, field_validator
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from services.core import laces as laces_service
from services.core.feed_cache import invalidate_feeds
from services.core.auth import get_current_active_user, get_current_admin_user
from services.database import get_db
from services.models.dropzone import DropZoneCheckIn
from services.models.laces import LacesLedger as LacesLedgerModel
from services.models.post import Post
from services.models.user import User

router = APIRouter()

TransactionType = Literal[
    'DAILY_STIPEND', 'BOOST_SENT', 'BOOST_RECEIVED', 'SIGNAL_REWARD', 'ADMIN_ADD', 'ADMIN_REMOVE',
    'PURCHASE', 'REFUND', 'CONTEST_REWARD', 'CHECKOUT_TASK_PURCHASE', 'CHECKOUT_TASK_REFUND',
    'POST_REWARD', 'CHECKIN_REWARD', 'QUEST_REWARD',
]

DEFAULT_DESCRIPTIONS = {
    'DAILY_STIPEND': "Daily LACES stipend",
    'BOOST_SENT': "Boosted a post",
    'BOOST_RECEIVED': "Post received boost",
    'SIGNAL_REWARD': "Signal quality reward",
    'CHECKIN_REWARD': "Drop zone check-in",
}


# Pydantic models
class LacesBalance(BaseModel):
    balance: int
    user_id: UUID4
    last_stipend: Optional[datetime]
    total_earned: int
    total_spent: int

class LacesTransaction(BaseModel):
    id: UUID4
    amount: int
    transaction_type: str
    related_post_id: Optional[UUID4]
    created_at: datetime
    description: Optional[str]
    balance_after: Optional[int] = None

class LacesLedger(BaseModel):
    transactions: List[LacesTransaction]
    total_count: int
    page: int
    limit: int

class GrantLacesRequest(BaseModel):
    user_id: UUID4
    amount: int
    transaction_type: TransactionType
    related_post_id: Optional[UUID4] = None
    description: Optional[str] = Field(None, max_length=500)

    @field_validator('amount')
    @classmethod
    def amount_is_not_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError('amount must not be zero')
        return value


def _raise_for(error: Exception) -> None:
    """Translate a ledger error into the HTTP error the API has always used."""
    if isinstance(error, (laces_service.UnknownUser, LookupError)):
        raise HTTPException(status_code=404, detail=str(error.args[0]) if error.args else "Not found")
    raise HTTPException(status_code=400, detail=str(error))


# Service functions
async def grant_laces(
    db: Session,
    user_id: UUID4,
    amount: int,
    transaction_type: str,
    related_post_id: Optional[UUID4] = None,
    description: Optional[str] = None
) -> Dict[str, Any]:
    """
    Credit or debit LACES for a user, record it in the ledger, and commit.

    A debit larger than the balance is refused (400) rather than clamped.
    """
    try:
        entry = laces_service.apply_laces(
            db, user_id, amount, transaction_type,
            related_post_id=related_post_id, description=description,
        )
    except laces_service.LacesError as error:
        db.rollback()
        _raise_for(error)
    db.commit()

    return {
        "transaction_id": entry.id,
        "new_balance": entry.balance_after,
        "amount": amount,
        "transaction_type": transaction_type
    }

async def calculate_earning_opportunities(
    db: Session,
    user_id: UUID4
) -> Dict[str, Any]:
    """
    Calculate what LACES earning opportunities are available to the user
    """
    today = laces_service.start_of_utc_day()
    daily_stipend_claimed = laces_service.stipend_claimed_today(db, user_id)

    posts_today = db.query(func.count(Post.post_id)).filter(
        Post.user_id == user_id,
        Post.timestamp >= today,
    ).scalar()

    checkins_today = db.query(func.count(DropZoneCheckIn.id)).filter(
        DropZoneCheckIn.user_id == user_id,
        DropZoneCheckIn.checked_in_at >= today,
    ).scalar()

    opportunities = []

    if not daily_stipend_claimed:
        opportunities.append({
            "type": "daily_stipend",
            "reward": laces_service.DAILY_STIPEND,
            "description": "Claim your daily LACES stipend"
        })

    opportunities.append({
        "type": "post_boosts",
        "reward": "50% of each boost",
        "description": "Share signals others find useful: you receive half of every boost"
    })

    if checkins_today == 0:
        opportunities.append({
            "type": "dropzone_checkin",
            "reward": "10-30",
            "description": "Check in to a drop zone (varies by streak)"
        })

    return {
        "opportunities": opportunities,
        "daily_stipend_claimed": daily_stipend_claimed,
        "posts_today": posts_today,
        "checkins_today": checkins_today
    }

# API Endpoints
@router.get("/laces/balance", response_model=LacesBalance)
def get_laces_balance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get current LACES balance for user"""
    user_id = current_user.user_id

    last_stipend = db.query(LacesLedgerModel.created_at).filter(
        LacesLedgerModel.user_id == user_id,
        LacesLedgerModel.transaction_type == 'DAILY_STIPEND',
    ).order_by(desc(LacesLedgerModel.created_at)).first()

    total_earned = db.query(func.coalesce(func.sum(LacesLedgerModel.amount), 0)).filter(
        LacesLedgerModel.user_id == user_id,
        LacesLedgerModel.amount > 0,
    ).scalar()

    total_spent = db.query(func.coalesce(func.sum(LacesLedgerModel.amount), 0)).filter(
        LacesLedgerModel.user_id == user_id,
        LacesLedgerModel.amount < 0,
    ).scalar()

    return LacesBalance(
        balance=current_user.laces_balance,
        user_id=user_id,
        last_stipend=last_stipend[0] if last_stipend else None,
        total_earned=total_earned,
        total_spent=abs(total_spent)
    )

@router.get("/laces/ledger", response_model=LacesLedger)
def get_laces_ledger(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    transaction_type: Optional[TransactionType] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get LACES transaction history for user"""
    query = db.query(LacesLedgerModel).filter(LacesLedgerModel.user_id == current_user.user_id)

    if transaction_type:
        query = query.filter(LacesLedgerModel.transaction_type == transaction_type)

    total_count = query.count()

    offset = (page - 1) * limit
    transactions = (
        query.order_by(desc(LacesLedgerModel.created_at), desc(LacesLedgerModel.id))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return LacesLedger(
        transactions=[
            LacesTransaction(
                id=tx.id,
                amount=tx.amount,
                transaction_type=tx.transaction_type,
                related_post_id=tx.related_post_id,
                created_at=tx.created_at,
                description=tx.description or DEFAULT_DESCRIPTIONS.get(tx.transaction_type),
                balance_after=tx.balance_after,
            )
            for tx in transactions
        ],
        total_count=total_count,
        page=page,
        limit=limit
    )

@router.post("/laces/grant")
async def grant_laces_admin(
    grant_request: GrantLacesRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """
    Grant or remove LACES tokens (admin only)
    """
    return await grant_laces(
        db=db,
        user_id=grant_request.user_id,
        amount=grant_request.amount,
        transaction_type=grant_request.transaction_type,
        related_post_id=grant_request.related_post_id,
        description=grant_request.description
    )

@router.post("/laces/daily-stipend")
def claim_daily_stipend(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Claim the daily LACES stipend (once per UTC day)
    """
    try:
        entry = laces_service.claim_daily_stipend(db, current_user.user_id)
    except laces_service.LacesError as error:
        db.rollback()
        _raise_for(error)
    db.commit()

    return {
        "transaction_id": entry.id,
        "new_balance": entry.balance_after,
        "amount": entry.amount,
        "transaction_type": entry.transaction_type,
        "message": f"Daily stipend claimed! +{entry.amount} LACES"
    }

@router.get("/laces/opportunities")
async def get_earning_opportunities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get available LACES earning opportunities for the user
    """
    return await calculate_earning_opportunities(db, current_user.user_id)

@router.post("/laces/boost-post/{post_id}")
def boost_post_with_laces(
    post_id: UUID4,
    boost_amount: int = Query(laces_service.DEFAULT_BOOST_AMOUNT, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Boost a post using LACES tokens. The booster pays the amount, the author
    receives half, and it all happens in one transaction.
    """
    try:
        result = laces_service.boost_post(db, post_id, current_user.user_id, boost_amount)
    except (laces_service.LacesError, LookupError) as error:
        db.rollback()
        _raise_for(error)
    db.commit()
    invalidate_feeds()  # the cached feed pages carry the old boost score

    return {"success": True, **result}
