
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

from services import models, schemas
from services.core.database import get_db
from services.core.security import get_current_user

router = APIRouter(
    prefix="/subscriptions",
    tags=["subscriptions"],
)

@router.post("/", response_model=schemas.Subscription)
def create_subscription(subscription: schemas.SubscriptionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_subscription = models.Subscription(**subscription.dict(), user_id=current_user.user_id)
    db.add(db_subscription)
    db.commit()
    db.refresh(db_subscription)
    return db_subscription

@router.get("/my", response_model=List[schemas.Subscription])
def get_my_subscriptions(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    subscriptions = db.query(models.Subscription).filter(models.Subscription.user_id == current_user.user_id).all()
    return subscriptions

@router.delete("/{subscription_id}", status_code=204)
def delete_subscription(subscription_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    subscription = db.query(models.Subscription).filter(models.Subscription.subscription_id == subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if subscription.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this subscription")
    db.delete(subscription)
    db.commit()
    return
