import uuid
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geography
from services.database import Base

class Location(Base):
    __tablename__ = 'locations'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    point = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    geohash = Column(String(12), nullable=False, index=True)
    # geoalchemy2 creates the GiST index on `point` (idx_locations_point) itself
