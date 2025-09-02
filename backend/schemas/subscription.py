
from pydantic import BaseModel, ConfigDict
import uuid
from datetime import datetime
from typing import Optional

class SubscriptionBase(BaseModel):
    brand: Optional[str] = None
    release_id: Optional[uuid.UUID] = None

class SubscriptionCreate(SubscriptionBase):
    pass

class Subscription(SubscriptionBase):
    subscription_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
