
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
import uuid
from datetime import datetime
from typing import Optional

class SubscriptionBase(BaseModel):
    brand: Optional[str] = None
    release_id: Optional[uuid.UUID] = None

class SubscriptionCreate(SubscriptionBase):
    brand: Optional[str] = Field(None, max_length=100)

    @field_validator("brand")
    @classmethod
    def blank_brand_is_no_brand(cls, value):
        return (value.strip() or None) if value is not None else None

    @model_validator(mode="after")
    def needs_something_to_follow(self):
        if self.brand is None and self.release_id is None:
            raise ValueError("Provide a brand, a release_id, or both")
        return self

class Subscription(SubscriptionBase):
    subscription_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
