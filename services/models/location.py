import uuid
from sqlalchemy import Column, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geography
from services.database import Base

class Location(Base):
    __tablename__ = 'locations'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    point = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    geohash = Column(String(12), nullable=False, index=True)
    # geoalchemy2 creates the GiST index on `point` (idx_locations_point) itself

    __table_args__ = (
        # Bounding-box filters compare geometry, not geography (see services.core.geospatial.within_bbox)
        Index('ix_locations_point_planar', text('(point::geometry)'), postgresql_using='gist'),
    )
