from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel, UUID4
import uuid

from backend.database import get_db
from backend.models.laces import LacesLedger as LacesLedgerModel
from backend.models.user import User
from backend.models.post import Post
from backend.models.dropzone import DropZoneCheckIn

router = APIRouter()

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

class LacesLedger(BaseModel):
    transactions: List[LacesTransaction]
    total_count: int
    page: int
    limit: int

class GrantLacesRequest(BaseModel):
    user_id: UUID4
    amount: int
    transaction_type: str
    related_post_id: Optional[UUID4] = None
    description: Optional[str] = None

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
    Grant LACES tokens to a user and update their balance
    """
    # Verify user exists
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create ledger entry
    ledger_entry = LacesLedgerModel(
        user_id=user_id,
        amount=amount,
        transaction_type=transaction_type,
        related_post_id=related_post_id
    )
    
    db.add(ledger_entry)
    
    # Update user balance
    user.laces_balance += amount
    
    # Ensure balance doesn't go negative
    if user.laces_balance < 0:
        user.laces_balance = 0
    
    db.commit()
    db.refresh(ledger_entry)
    db.refresh(user)
    
    return {
        "transaction_id": ledger_entry.id,
        "new_balance": user.laces_balance,
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
    today = datetime.now().date()
    
    # Check if daily stipend already claimed
    daily_stipend_claimed = db.query(LacesLedgerModel).filter(
        and_(
            LacesLedgerModel.user_id == user_id,
            LacesLedgerModel.transaction_type == 'DAILY_STIPEND',
            func.date(LacesLedgerModel.created_at) == today
        )
    ).first() is not None
    
    # Count posts today (for boost opportunities)
    posts_today = db.query(func.count(Post.post_id)).filter(
        and_(
            Post.user_id == user_id,
            func.date(Post.timestamp) == today
        )
    ).scalar()
    
    # Count check-ins today
    checkins_today = db.query(func.count(DropZoneCheckIn.id)).filter(
        and_(
            DropZoneCheckIn.user_id == user_id,
            func.date(DropZoneCheckIn.checked_in_at) == today
        )
    ).scalar()
    
    opportunities = []
    
    if not daily_stipend_claimed:
        opportunities.append({
            "type": "daily_stipend",
            "reward": 100,
            "description": "Claim your daily LACES stipend"
        })
    
    if posts_today < 5:  # Limit boost posts per day
        opportunities.append({
            "type": "helpful_post",
            "reward": 25,
            "description": f"Share helpful content ({posts_today}/5 today)"
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
async def get_laces_balance(
    db: Session = Depends(get_db)
    # TODO: Add authentication to get current_user
):
    """Get current LACES balance for user"""
    user_id = uuid.uuid4()  # TODO: Get from auth
    
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get last stipend date
    last_stipend = db.query(LacesLedgerModel.created_at).filter(
        and_(
            LacesLedgerModel.user_id == user_id,
            LacesLedgerModel.transaction_type == 'DAILY_STIPEND'
        )
    ).order_by(desc(LacesLedgerModel.created_at)).first()
    
    # Calculate totals
    total_earned = db.query(func.sum(LacesLedgerModel.amount)).filter(
        and_(
            LacesLedgerModel.user_id == user_id,
            LacesLedgerModel.amount > 0
        )
    ).scalar() or 0
    
    total_spent = db.query(func.sum(LacesLedgerModel.amount)).filter(
        and_(
            LacesLedgerModel.user_id == user_id,
            LacesLedgerModel.amount < 0
        )
    ).scalar() or 0
    
    return LacesBalance(
        balance=user.laces_balance,
        user_id=user.user_id,
        last_stipend=last_stipend[0] if last_stipend else None,
        total_earned=total_earned,
        total_spent=abs(total_spent)
    )

@router.get("/laces/ledger", response_model=LacesLedger)
async def get_laces_ledger(
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    transaction_type: Optional[str] = Query(None),
    db: Session = Depends(get_db)
    # TODO: Add authentication
):
    """Get LACES transaction history for user"""
    user_id = uuid.uuid4()  # TODO: Get from auth
    
    query = db.query(LacesLedgerModel).filter(LacesLedgerModel.user_id == user_id)
    
    if transaction_type:
        query = query.filter(LacesLedgerModel.transaction_type == transaction_type)
    
    # Get total count for pagination
    total_count = query.count()
    
    # Apply pagination
    offset = (page - 1) * limit
    transactions = query.order_by(desc(LacesLedgerModel.created_at)).offset(offset).limit(limit).all()
    
    # Build response
    transaction_list = []
    for tx in transactions:
        # Generate description based on transaction type
        description = None
        if tx.transaction_type == 'DAILY_STIPEND':
            description = "Daily LACES stipend"
        elif tx.transaction_type == 'BOOST_SENT':
            description = "Boosted a post"
        elif tx.transaction_type == 'BOOST_RECEIVED':
            description = "Post received boost"
        elif tx.transaction_type == 'SIGNAL_REWARD':
            description = "Signal quality reward"
        
        transaction_list.append(LacesTransaction(
            id=tx.id,
            amount=tx.amount,
            transaction_type=tx.transaction_type,
            related_post_id=tx.related_post_id,
            created_at=tx.created_at,
            description=description
        ))
    
    return LacesLedger(
        transactions=transaction_list,
        total_count=total_count,
        page=page,
        limit=limit
    )

@router.post("/laces/grant")
async def grant_laces_admin(
    grant_request: GrantLacesRequest,
    db: Session = Depends(get_db)
    # TODO: Add admin authentication
):
    """
    Grant LACES tokens (admin/task only)
    """
    # TODO: Verify admin permissions or task auth
    
    result = await grant_laces(
        db=db,
        user_id=grant_request.user_id,
        amount=grant_request.amount,
        transaction_type=grant_request.transaction_type,
        related_post_id=grant_request.related_post_id,
        description=grant_request.description
    )
    
    return result

@router.post("/laces/daily-stipend")
async def claim_daily_stipend(
    db: Session = Depends(get_db)
    # TODO: Add authentication
):
    """
    Claim daily LACES stipend (100 LACES per day)
    """
    user_id = uuid.uuid4()  # TODO: Get from auth
    
    # Check if already claimed today
    today = datetime.now().date()
    existing_stipend = db.query(LacesLedgerModel).filter(
        and_(
            LacesLedgerModel.user_id == user_id,
            LacesLedgerModel.transaction_type == 'DAILY_STIPEND',
            func.date(LacesLedgerModel.created_at) == today
        )
    ).first()
    
    if existing_stipend:
        raise HTTPException(status_code=400, detail="Daily stipend already claimed")
    
    # Grant stipend
    result = await grant_laces(
        db=db,
        user_id=user_id,
        amount=100,
        transaction_type='DAILY_STIPEND',
        description="Daily LACES stipend"
    )
    
    return {
        **result,
        "message": "Daily stipend claimed! +100 LACES"
    }

@router.get("/laces/opportunities")
async def get_earning_opportunities(
    db: Session = Depends(get_db)
    # TODO: Add authentication
):
    """
    Get available LACES earning opportunities for the user
    """
    user_id = uuid.uuid4()  # TODO: Get from auth
    
    opportunities = await calculate_earning_opportunities(db, user_id)
    
    return opportunities

@router.post("/laces/boost-post/{post_id}")
async def boost_post_with_laces(
    post_id: UUID4,
    boost_amount: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
    # TODO: Add authentication
):
    """
    Boost a post using LACES tokens
    """
    user_id = uuid.uuid4()  # TODO: Get from auth
    
    # Verify user has enough LACES
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.laces_balance < boost_amount:
        raise HTTPException(status_code=400, detail="Insufficient LACES balance")
    
    # Verify post exists
    post = db.query(Post).filter(Post.post_id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Can't boost your own posts
    if post.user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot boost your own post")
    
    # Deduct LACES from booster
    await grant_laces(
        db=db,
        user_id=user_id,
        amount=-boost_amount,
        transaction_type='BOOST_SENT',
        related_post_id=post_id,
        description=f"Boosted post with {boost_amount} LACES"
    )
    
    # Reward post author (50% of boost amount)
    reward_amount = boost_amount // 2
    await grant_laces(
        db=db,
        user_id=post.user_id,
        amount=reward_amount,
        transaction_type='BOOST_RECEIVED',
        related_post_id=post_id,
        description=f"Received {reward_amount} LACES from post boost"
    )
    
    # Update post boost score
    post.boost_score = (post.boost_score or 0) + boost_amount
    db.commit()
    
    return {
        "success": True,
        "boost_amount": boost_amount,
        "author_reward": reward_amount,
        "new_boost_score": post.boost_score,
        "remaining_balance": user.laces_balance
    }