
import uuid
from sqlalchemy import Column, String, DateTime, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from services.database import Base

class Release(Base):
    __tablename__ = "releases"

    release_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sneaker_name = Column(String, nullable=False)
    brand = Column(String, nullable=False)
    release_date = Column(DateTime(timezone=True), nullable=False)
    retail_price = Column(Numeric(10, 2), nullable=False)
    store_links = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
