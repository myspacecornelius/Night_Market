import uuid
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, UUID4
from sqlalchemy.orm import Session
import redis.asyncio as redis

from services.database import get_db
from services.core.redis_client import get_redis
from services.models.user import User
from services.routers.laces import grant_laces

router = APIRouter()

class CheckoutTaskPurchaseRequest(BaseModel):
    product_url: str
    variant_id: str
    size: str
    retailer: str
    mode: str  # 'request' or 'browser'
    profile_id: str
    cost: int # Cost in LACES

from services.core.security import get_current_user

@router.post("/shop/purchase-checkout-task", status_code=202)
async def purchase_checkout_task(
    request: CheckoutTaskPurchaseRequest,
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user)
):
    """
    Purchase a checkout task using LACES.
    """
    user = current_user

    if user.laces_balance < request.cost:
        raise HTTPException(status_code=400, detail="Insufficient LACES balance")

    # 2. Deduct LACES for the purchase
    await grant_laces(
        db=db,
        user_id=user.user_id,
        amount=-request.cost,
        transaction_type='CHECKOUT_TASK_PURCHASE',
        description=f"Purchased checkout task for {request.product_url}"
    )

    # 3. Create and queue the checkout task
    task_id = str(uuid.uuid4())
    task_data = {
        "task_id": task_id,
        "user_id": str(user.user_id), # Add user_id to the task
        "profile_id": request.profile_id,
        "product_url": request.product_url,
        "variant_id": request.variant_id,
        "size": request.size,
        "retailer": request.retailer,
        "mode": request.mode,
        "is_dry_run": False # Could be a request parameter
    }

    await redis_client.lpush("checkout_queue", json.dumps(task_data))

    return {"message": "Checkout task purchased and queued successfully.", "task_id": task_id}
