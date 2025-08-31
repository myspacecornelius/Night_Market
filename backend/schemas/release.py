
from pydantic import BaseModel
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List

class ReleaseBase(BaseModel):
    sneaker_name: str
    brand: str
    release_date: datetime
    retail_price: Decimal
    store_links: Optional[dict] = None

class ReleaseCreate(ReleaseBase):
    pass

class ReleaseUpdate(ReleaseBase):
    pass

class Release(ReleaseBase):
    release_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
