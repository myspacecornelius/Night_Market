
from pydantic import BaseModel, ConfigDict, Field, field_validator
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Optional, List

# releases.retail_price is numeric(10, 2): at most 8 digits before the decimal point.
# Checked here so a bad price is a 422 that names the field, not a database error.
MAX_RETAIL_PRICE = Decimal("99999999.99")
RetailPrice = Annotated[Decimal, Field(ge=0, le=MAX_RETAIL_PRICE, max_digits=10, decimal_places=2)]

class ReleaseBase(BaseModel):
    sneaker_name: str
    brand: str
    release_date: datetime
    retail_price: Decimal
    store_links: Optional[dict] = None

class ReleaseCreate(ReleaseBase):
    retail_price: RetailPrice

class ReleaseUpdate(BaseModel):
    """A partial update: only the fields that are sent change, including falsy values."""
    sneaker_name: Optional[str] = None
    brand: Optional[str] = None
    release_date: Optional[datetime] = None
    retail_price: Optional[RetailPrice] = None
    store_links: Optional[dict] = None  # an explicit null clears the links

    @field_validator("sneaker_name", "brand", "release_date", "retail_price")
    @classmethod
    def required_columns_cannot_be_cleared(cls, value):
        # Runs only for fields that were sent: leaving one out keeps it, null is refused.
        if value is None:
            raise ValueError("cannot be null")
        return value

class Release(ReleaseBase):
    release_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
