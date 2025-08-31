import uuid
from sqlalchemy import Column, String, Index
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geography
from backend.database import Base

class Location(Base):
    __tablename__ = 'locations'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    point = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    geohash = Column(String(12), nullable=False, index=True)
    __table_args__ = (Index('ix_locations_point', point, postgresql_using='gist'),)
