import uuid
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Enum, Float, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from geoalchemy2 import Geography
from backend.database import Base
from enum import Enum as PyEnum

class DropZoneStatus(PyEnum):
    SCHEDULED = 'scheduled'
    ACTIVE = 'active' 
    ENDED = 'ended'
    CANCELLED = 'cancelled'

class MemberRole(PyEnum):
    MEMBER = 'member'
    MODERATOR = 'moderator'
    OWNER = 'owner'

class DropZone(Base):
    __tablename__ = 'dropzones'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id'), nullable=False)
    
    # Geospatial data - using both center point and polygon for flexibility
    center_point = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    radius_meters = Column(Float, nullable=False, default=100.0)  # For simple circular zones
    boundary_polygon = Column(Geography(geometry_type='POLYGON', srid=4326), nullable=True)  # For complex shapes
    
    # Time windows
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    
    # Configuration
    status = Column(Enum(DropZoneStatus), nullable=False, default=DropZoneStatus.SCHEDULED)
    max_capacity = Column(Integer, nullable=True)  # Max check-ins allowed
    check_in_radius = Column(Float, nullable=False, default=50.0)  # Distance required for check-in
    
    # Settings
    rules = Column(Text, nullable=True)
    tags = Column(ARRAY(String), nullable=True)
    is_public = Column(Boolean, nullable=False, default=True)
    allow_posts = Column(Boolean, nullable=False, default=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    members = relationship("DropZoneMember", back_populates="dropzone", cascade="all, delete-orphan")
    check_ins = relationship("DropZoneCheckIn", back_populates="dropzone", cascade="all, delete-orphan")

class DropZoneMember(Base):
    __tablename__ = 'dropzone_members'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dropzone_id = Column(UUID(as_uuid=True), ForeignKey('dropzones.id'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id'), nullable=False)
    role = Column(Enum(MemberRole), nullable=False, default=MemberRole.MEMBER)
    
    # RSVP data
    rsvp_status = Column(Enum('going', 'maybe', 'not_going', name='rsvp_status_enum'), nullable=True)
    rsvp_message = Column(Text, nullable=True)
    
    # Metadata
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    dropzone = relationship("DropZone", back_populates="members")

class DropZoneCheckIn(Base):
    __tablename__ = 'dropzone_checkins'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dropzone_id = Column(UUID(as_uuid=True), ForeignKey('dropzones.id'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.user_id'), nullable=False)
    
    # Location verification
    check_in_location = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    distance_from_center = Column(Float, nullable=False)  # Meters from dropzone center
    
    # Check-in data
    message = Column(Text, nullable=True)
    photo_url = Column(String, nullable=True)
    
    # Streak and gamification
    streak_count = Column(Integer, nullable=False, default=1)  # User's current streak at this zone
    points_earned = Column(Integer, nullable=False, default=10)
    
    # Metadata
    checked_in_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    dropzone = relationship("DropZone", back_populates="check_ins")