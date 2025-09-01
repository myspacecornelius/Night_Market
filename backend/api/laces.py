from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from .. import models, schemas
from ..core.database import get_db
from ..core.security import get_current_user, get_current_admin_user

router = APIRouter(prefix="/laces", tags=["laces"])

@router.get("/balance", response_model=schemas.LacesBalance)
async def get_laces_balance(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's LACES balance and statistics"""
    # Calculate derived stats
    total_earned = db.query(models.LacesLedger).filter(
        models.LacesLedger.user_id == current_user.user_id,
        models.LacesLedger.amount > 0
    ).with_entities(func.coalesce(func.sum(models.LacesLedger.amount), 0)).scalar()
    
    total_spent = db.query(models.LacesLedger).filter(
        models.LacesLedger.user_id == current_user.user_id,
        models.LacesLedger.amount < 0
    ).with_entities(func.coalesce(func.sum(models.LacesLedger.amount), 0)).scalar()
    
    # Get user rank
    users_with_higher_balance = db.query(models.User).filter(
        models.User.laces_balance > current_user.laces_balance
    ).count()
    
    total_users = db.query(models.User).count()
    percentile = ((total_users - users_with_higher_balance) / total_users) * 100 if total_users > 0 else 0
    
    return schemas.LacesBalance(
        user_id=str(current_user.user_id),
        balance=current_user.laces_balance,
        lifetime_earned=abs(total_earned),
        lifetime_spent=abs(total_spent),
        rank=users_with_higher_balance + 1,
        percentile=round(percentile, 1)
    )

@router.get("/transactions", response_model=List[schemas.LacesTransaction])
async def get_laces_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    transaction_type: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's LACES transaction history"""
    query = db.query(models.LacesLedger).filter(
        models.LacesLedger.user_id == current_user.user_id
    )
    
    if transaction_type:
        query = query.filter(models.LacesLedger.transaction_type == transaction_type)
    
    transactions = query.order_by(
        models.LacesLedger.created_at.desc()
    ).offset(skip).limit(limit).all()
    
    return [
        schemas.LacesTransaction(
            id=str(t.id),
            user_id=str(t.user_id),
            amount=t.amount,
            transaction_type=t.transaction_type,
            description=t.description,
            related_post_id=str(t.related_post_id) if t.related_post_id else None,
            reference_id=t.reference_id,
            created_at=t.created_at
        ) for t in transactions
    ]

@router.get("/leaderboard", response_model=List[schemas.LacesLeaderboardEntry])
async def get_laces_leaderboard(
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get LACES leaderboard"""
    top_users = db.query(models.User).order_by(
        models.User.laces_balance.desc()
    ).limit(limit).all()
    
    return [
        schemas.LacesLeaderboardEntry(
            user_id=str(user.user_id),
            username=user.username,
            display_name=user.display_name,
            balance=user.laces_balance,
            rank=index + 1
        ) for index, user in enumerate(top_users)
    ]

@router.post("/transfer")
async def transfer_laces(
    transfer_data: schemas.LacesTransfer,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Transfer LACES between users"""
    # Check if sender has sufficient balance
    if current_user.laces_balance < transfer_data.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient LACES balance"
        )
    
    # Get recipient user
    recipient = db.query(models.User).filter(
        models.User.user_id == transfer_data.recipient_user_id
    ).first()
    
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipient user not found"
        )
    
    if recipient.user_id == current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer to yourself"
        )
    
    try:
        # Create debit transaction for sender
        sender_transaction = models.LacesLedger(
            user_id=current_user.user_id,
            amount=-transfer_data.amount,
            transaction_type='TRANSFER_SENT',
            description=f"Transfer to @{recipient.username}: {transfer_data.description}",
            reference_id=f"transfer_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        )
        
        # Create credit transaction for recipient
        recipient_transaction = models.LacesLedger(
            user_id=recipient.user_id,
            amount=transfer_data.amount,
            transaction_type='TRANSFER_RECEIVED',
            description=f"Transfer from @{current_user.username}: {transfer_data.description}",
            reference_id=sender_transaction.reference_id
        )
        
        # Update balances
        current_user.laces_balance -= transfer_data.amount
        recipient.laces_balance += transfer_data.amount
        
        # Add transactions to database
        db.add(sender_transaction)
        db.add(recipient_transaction)
        db.commit()
        
        return {"success": True, "message": f"Transferred {transfer_data.amount} LACES to @{recipient.username}"}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transfer failed"
        )

@router.post("/admin/adjust")
async def admin_adjust_balance(
    adjustment_data: schemas.LacesAdminAdjustment,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Admin endpoint to adjust user LACES balance"""
    # Get target user
    target_user = db.query(models.User).filter(
        models.User.user_id == adjustment_data.user_id
    ).first()
    
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    try:
        # Create admin transaction
        transaction = models.LacesLedger(
            user_id=target_user.user_id,
            amount=adjustment_data.amount,
            transaction_type='ADMIN_ADD' if adjustment_data.amount > 0 else 'ADMIN_REMOVE',
            description=f"Admin adjustment by @{current_admin.username}: {adjustment_data.reason}",
            reference_id=f"admin_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        )
        
        # Update user balance
        target_user.laces_balance += adjustment_data.amount
        
        # Ensure balance doesn't go negative
        if target_user.laces_balance < 0:
            target_user.laces_balance = 0
        
        db.add(transaction)
        db.commit()
        
        return {
            "success": True, 
            "message": f"Adjusted @{target_user.username}'s balance by {adjustment_data.amount} LACES",
            "new_balance": target_user.laces_balance
        }
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Balance adjustment failed"
        )

@router.get("/analytics", response_model=schemas.LacesAnalytics)
async def get_laces_analytics(
    timeframe: str = Query("day", regex="^(hour|day|week|month)$"),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get LACES economy analytics (admin only)"""
    # Calculate time range
    now = datetime.now()
    if timeframe == "hour":
        start_time = now - timedelta(hours=1)
    elif timeframe == "day":
        start_time = now - timedelta(days=1)
    elif timeframe == "week":
        start_time = now - timedelta(days=7)
    else:  # month
        start_time = now - timedelta(days=30)
    
    # Get transactions in timeframe
    transactions = db.query(models.LacesLedger).filter(
        models.LacesLedger.created_at >= start_time
    ).all()
    
    total_distributed = sum(t.amount for t in transactions if t.amount > 0)
    total_spent = sum(abs(t.amount) for t in transactions if t.amount < 0)
    
    # Get transaction type breakdown
    type_breakdown = {}
    for transaction in transactions:
        t_type = transaction.transaction_type
        if t_type not in type_breakdown:
            type_breakdown[t_type] = {"count": 0, "amount": 0}
        type_breakdown[t_type]["count"] += 1
        type_breakdown[t_type]["amount"] += transaction.amount
    
    return schemas.LacesAnalytics(
        timeframe=timeframe,
        total_distributed=total_distributed,
        total_spent=total_spent,
        transaction_count=len(transactions),
        unique_users=len(set(t.user_id for t in transactions)),
        type_breakdown=type_breakdown
    )