from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text, and_, or_
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field, UUID4, field_validator, model_validator
from services.schemas.post import Tag
from collections import namedtuple
from geoalchemy2.shape import to_shape
import math

from services.database import get_db
from services.core import laces as laces_service
from services.core.auth import get_current_active_user, get_optional_user
from services.core.geospatial import parse_bbox, within_bbox
from services.core.metrics import DROPZONE_CHECKINS
from services.models.dropzone import DropZone, DropZoneMember, DropZoneCheckIn, DropZoneStatus, MemberRole
from services.models.user import User

router = APIRouter()

# Check-ins pay LACES and the position is whatever the client reports, so the payout
# is bounded per user instead of per zone: creating more zones earns nothing extra.
MAX_REWARDED_CHECKINS_PER_DAY = 3
MAX_DROPZONES_CREATED_PER_DAY = 5
MAX_CHECK_IN_RADIUS_METERS = 500


def lock_user(db: Session, user_id) -> None:
    """Serialise this user's check-ins, joins and zone creations.

    The "already checked in / already a member / daily limit" checks read first and
    write afterwards; without the row lock, simultaneous requests all passed the read.
    The handlers that use it are plain ``def`` (they run in a worker thread), because
    waiting for a row lock on the event loop would stall every other request.
    """
    db.query(User.user_id).filter(User.user_id == user_id).with_for_update().first()


def refuse(db: Session, status_code: int, detail: str) -> HTTPException:
    """The error to raise once row locks are held: releases them straight away."""
    db.rollback()
    return HTTPException(status_code=status_code, detail=detail)


Coords = namedtuple("Coords", ["lat", "lng"])


def point_coords(point) -> Coords:
    """Latitude/longitude of a PostGIS point column value."""
    shape = to_shape(point)
    return Coords(lat=shape.y, lng=shape.x)

def is_member(db: Session, dropzone_id, user: Optional[User]) -> bool:
    if user is None:
        return False
    return db.query(DropZoneMember.id).filter(
        DropZoneMember.dropzone_id == dropzone_id, DropZoneMember.user_id == user.user_id
    ).first() is not None


def get_visible_dropzone(db: Session, dropzone_id, viewer: Optional[User]) -> DropZone:
    """Load a dropzone the viewer may see.

    A private zone (is_public = false) is indistinguishable from a missing one for
    everyone except its members: both are a 404.
    """
    dropzone = db.query(DropZone).filter(DropZone.id == dropzone_id).first()
    if dropzone is None or (not dropzone.is_public and not is_member(db, dropzone_id, viewer)):
        raise HTTPException(status_code=404, detail="Dropzone not found")
    return dropzone


# Pydantic models for API
def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Treat a datetime sent without an offset as UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class DropZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    center_lat: float = Field(ge=-90, le=90)
    center_lng: float = Field(ge=-180, le=180)
    radius_meters: float = Field(100.0, gt=0, le=50_000)
    check_in_radius: float = Field(50.0, gt=0, le=MAX_CHECK_IN_RADIUS_METERS)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_capacity: Optional[int] = Field(None, ge=1)
    rules: Optional[str] = Field(None, max_length=5000)
    tags: Optional[List[Tag]] = Field(None, max_length=20)
    is_public: bool = True

    _utc_times = field_validator('starts_at', 'ends_at')(_as_utc)

    @model_validator(mode='after')
    def ends_after_it_starts(self):
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError('ends_at must be after starts_at')
        return self

class DropZoneResponse(BaseModel):
    id: UUID4
    name: str
    description: Optional[str]
    owner_id: UUID4
    center_lat: float
    center_lng: float
    radius_meters: float
    status: str
    starts_at: Optional[datetime]
    ends_at: Optional[datetime]
    member_count: int
    check_in_count: int
    created_at: datetime

class CheckInRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    message: Optional[str] = Field(None, max_length=1000)
    photo_url: Optional[str] = Field(None, max_length=500)

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the great circle distance in meters between two points 
    on the earth (specified in decimal degrees)
    """
    # Convert decimal degrees to radians
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371000  # Radius of earth in meters
    return c * r

@router.post("/v1/dropzones", response_model=DropZoneResponse)
def create_dropzone(
    dropzone_data: DropZoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new dropzone"""
    owner_id = current_user.user_id

    lock_user(db, owner_id)
    created_today = db.query(func.count(DropZone.id)).filter(
        DropZone.owner_id == owner_id,
        DropZone.created_at >= laces_service.start_of_utc_day(),
    ).scalar()
    if created_today >= MAX_DROPZONES_CREATED_PER_DAY:
        raise refuse(db, 429, f"You can create at most {MAX_DROPZONES_CREATED_PER_DAY} dropzones per day")
    
    # Create PostGIS point for center
    center_point_wkt = f"POINT({dropzone_data.center_lng} {dropzone_data.center_lat})"
    
    dropzone = DropZone(
        name=dropzone_data.name,
        description=dropzone_data.description,
        owner_id=owner_id,
        center_point=func.ST_GeogFromText(center_point_wkt),
        radius_meters=dropzone_data.radius_meters,
        check_in_radius=dropzone_data.check_in_radius,
        starts_at=dropzone_data.starts_at,
        ends_at=dropzone_data.ends_at,
        max_capacity=dropzone_data.max_capacity,
        rules=dropzone_data.rules,
        tags=dropzone_data.tags,
        is_public=dropzone_data.is_public,
        status=(
            DropZoneStatus.SCHEDULED
            if dropzone_data.starts_at and dropzone_data.starts_at > datetime.now(timezone.utc)
            else DropZoneStatus.ACTIVE
        )
    )
    
    db.add(dropzone)
    db.flush()
    
    # Add owner as member with OWNER role (same transaction as the zone)
    owner_member = DropZoneMember(
        dropzone_id=dropzone.id,
        user_id=owner_id,
        role=MemberRole.OWNER,
        rsvp_status='going'
    )
    db.add(owner_member)
    db.commit()
    db.refresh(dropzone)
    
    # Get coordinates back from PostGIS for response
    coords_result = point_coords(dropzone.center_point)
    
    return DropZoneResponse(
        id=dropzone.id,
        name=dropzone.name,
        description=dropzone.description,
        owner_id=dropzone.owner_id,
        center_lat=coords_result.lat,
        center_lng=coords_result.lng,
        radius_meters=dropzone.radius_meters,
        status=dropzone.status.value,
        starts_at=dropzone.starts_at,
        ends_at=dropzone.ends_at,
        member_count=1,  # Owner just joined
        check_in_count=0,
        created_at=dropzone.created_at
    )

@router.get("/v1/dropzones", response_model=List[DropZoneResponse])
def list_dropzones(
    bbox: Optional[str] = Query(None, description="Bounding box: min_lng,min_lat,max_lng,max_lat"),
    active: Optional[bool] = Query(None, description="Filter by active status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    """List public dropzones (and private ones the caller belongs to) with optional spatial filtering"""
    visible = DropZone.is_public.is_(True)
    if viewer is not None:
        visible = or_(visible, DropZone.id.in_(
            db.query(DropZoneMember.dropzone_id).filter(DropZoneMember.user_id == viewer.user_id)
        ))
    query = db.query(DropZone).filter(visible)
    
    # Filter by status if active parameter provided
    if active is not None:
        if active:
            now = datetime.now(timezone.utc)
            query = query.filter(
                and_(
                    DropZone.status == DropZoneStatus.ACTIVE,
                    or_(
                        DropZone.starts_at.is_(None),
                        DropZone.starts_at <= now
                    ),
                    or_(
                        DropZone.ends_at.is_(None), 
                        DropZone.ends_at >= now
                    )
                )
            )
        else:
            query = query.filter(DropZone.status != DropZoneStatus.ACTIVE)
    
    # Apply bbox filter if provided
    if bbox:
        try:
            query = query.filter(within_bbox(DropZone.center_point, parse_bbox(bbox)))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    # Apply pagination
    dropzones = query.order_by(DropZone.created_at.desc(), DropZone.id).offset(offset).limit(limit).all()
    
    # Member and check-in counts for the whole page in two queries
    zone_ids = [dropzone.id for dropzone in dropzones]
    member_counts = dict(
        db.query(DropZoneMember.dropzone_id, func.count(DropZoneMember.id))
        .filter(DropZoneMember.dropzone_id.in_(zone_ids))
        .group_by(DropZoneMember.dropzone_id)
        .all()
    ) if zone_ids else {}
    check_in_counts = dict(
        db.query(DropZoneCheckIn.dropzone_id, func.count(DropZoneCheckIn.id))
        .filter(DropZoneCheckIn.dropzone_id.in_(zone_ids))
        .group_by(DropZoneCheckIn.dropzone_id)
        .all()
    ) if zone_ids else {}
    
    # Build response with computed fields
    results = []
    for dropzone in dropzones:
        # Get coordinates from PostGIS
        coords_result = point_coords(dropzone.center_point)
        member_count = member_counts.get(dropzone.id, 0)
        check_in_count = check_in_counts.get(dropzone.id, 0)
        
        results.append(DropZoneResponse(
            id=dropzone.id,
            name=dropzone.name,
            description=dropzone.description,
            owner_id=dropzone.owner_id,
            center_lat=coords_result.lat,
            center_lng=coords_result.lng,
            radius_meters=dropzone.radius_meters,
            status=dropzone.status.value,
            starts_at=dropzone.starts_at,
            ends_at=dropzone.ends_at,
            member_count=member_count,
            check_in_count=check_in_count,
            created_at=dropzone.created_at
        ))
    
    return results

@router.post("/v1/dropzones/{dropzone_id}/checkin")
def check_in_to_dropzone(
    dropzone_id: UUID4,
    check_in_data: CheckInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Check in to a dropzone with location verification"""
    # Get dropzone (a private zone only exists for its members)
    dropzone = get_visible_dropzone(db, dropzone_id, current_user)
    
    # Check if dropzone is active
    now = datetime.now(timezone.utc)
    if dropzone.status != DropZoneStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Dropzone is not active")
    
    if dropzone.starts_at and dropzone.starts_at > now:
        raise HTTPException(status_code=400, detail="Dropzone has not started yet")
    
    if dropzone.ends_at and dropzone.ends_at < now:
        raise HTTPException(status_code=400, detail="Dropzone has ended")
    
    # Get dropzone center coordinates
    coords_result = point_coords(dropzone.center_point)
    
    center_lat, center_lng = coords_result.lat, coords_result.lng
    
    # Calculate distance from center using haversine formula
    distance = haversine_distance(
        check_in_data.lat, check_in_data.lng,
        center_lat, center_lng
    )
    
    # Verify user is within check-in radius
    if distance > dropzone.check_in_radius:
        raise HTTPException(
            status_code=400, 
            detail=f"Too far from dropzone. Distance: {distance:.1f}m, Required: {dropzone.check_in_radius}m"
        )
    
    user_id = current_user.user_id
    lock_user(db, user_id)
    
    # Check if user already checked in today (UTC day)
    today_start = laces_service.start_of_utc_day(now)
    existing_checkin = db.query(DropZoneCheckIn).filter(
        and_(
            DropZoneCheckIn.dropzone_id == dropzone_id,
            DropZoneCheckIn.user_id == user_id,
            DropZoneCheckIn.checked_in_at >= today_start
        )
    ).first()
    
    if existing_checkin:
        raise refuse(db, 400, "Already checked in today")
    
    # Calculate streak count
    # Get user's last check-in at this dropzone
    last_checkin = db.query(DropZoneCheckIn).filter(
        and_(
            DropZoneCheckIn.dropzone_id == dropzone_id,
            DropZoneCheckIn.user_id == user_id
        )
    ).order_by(DropZoneCheckIn.checked_in_at.desc()).first()
    
    streak_count = 1
    if last_checkin:
        last_date = last_checkin.checked_in_at.astimezone(timezone.utc).date()
        yesterday = (now - timedelta(days=1)).date()
        
        if last_date == yesterday:
            streak_count = last_checkin.streak_count + 1
        # If there's a gap, streak resets to 1
    elif dropzone.max_capacity is not None:
        # First visit: max_capacity limits how many different people may check in.
        # The zone row is locked so two first visits cannot both take the last place.
        db.query(DropZone.id).filter(DropZone.id == dropzone_id).with_for_update().first()
        attendees = db.query(func.count(func.distinct(DropZoneCheckIn.user_id))).filter(
            DropZoneCheckIn.dropzone_id == dropzone_id
        ).scalar()
        if attendees >= dropzone.max_capacity:
            raise refuse(db, 409, "Dropzone is at capacity")
    
    # Calculate points based on streak
    base_points = 10
    streak_bonus = min(streak_count - 1, 10) * 2  # Max 20 bonus points
    total_points = base_points + streak_bonus

    # The check-in always counts; the LACES reward is limited. A zone's owner earns
    # nothing at their own zone, and only the first few check-ins of the day pay.
    rewarded_today = db.query(func.count(DropZoneCheckIn.id)).filter(
        DropZoneCheckIn.user_id == user_id,
        DropZoneCheckIn.checked_in_at >= today_start,
        DropZoneCheckIn.points_earned > 0,
    ).scalar()
    if dropzone.owner_id == user_id:
        total_points = 0
        reward_note = "No LACES for checking in at your own dropzone."
    elif rewarded_today >= MAX_REWARDED_CHECKINS_PER_DAY:
        total_points = 0
        reward_note = f"Daily limit of {MAX_REWARDED_CHECKINS_PER_DAY} rewarded check-ins reached."
    else:
        reward_note = f"Points: {total_points}"
    
    # Create check-in record
    check_in_location_wkt = f"POINT({check_in_data.lng} {check_in_data.lat})"
    
    checkin = DropZoneCheckIn(
        dropzone_id=dropzone_id,
        user_id=user_id,
        check_in_location=func.ST_GeogFromText(check_in_location_wkt),
        distance_from_center=distance,
        message=check_in_data.message,
        photo_url=check_in_data.photo_url,
        streak_count=streak_count,
        points_earned=total_points,
        # The same clock as the "already checked in today" check above
        checked_in_at=now,
    )
    
    db.add(checkin)
    db.flush()
    
    # The points are paid out as LACES in the same transaction as the check-in
    if total_points > 0:
        laces_balance = laces_service.apply_laces(
            db, user_id, total_points, 'CHECKIN_REWARD',
            description=f"Checked in at {dropzone.name} (streak {streak_count})",
            reference_id=str(checkin.id),
        ).balance_after
    else:
        laces_balance = db.query(User.laces_balance).filter(User.user_id == user_id).scalar()
    db.commit()
    DROPZONE_CHECKINS.inc()
    
    return {
        "success": True,
        "check_in_id": checkin.id,
        "distance_from_center": distance,
        "streak_count": streak_count,
        "points_earned": total_points,
        "laces_balance": laces_balance,
        "message": f"Successfully checked in! Streak: {streak_count}. {reward_note}"
    }

@router.get("/v1/dropzones/{dropzone_id}")
def get_dropzone_details(
    dropzone_id: UUID4,
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    """Get detailed information about a dropzone"""
    dropzone = get_visible_dropzone(db, dropzone_id, viewer)
    
    # Get coordinates from PostGIS
    coords_result = point_coords(dropzone.center_point)
    
    # Get stats
    member_count = db.query(func.count(DropZoneMember.id)).filter(
        DropZoneMember.dropzone_id == dropzone_id
    ).scalar()
    
    total_checkins = db.query(func.count(DropZoneCheckIn.id)).filter(
        DropZoneCheckIn.dropzone_id == dropzone_id
    ).scalar()
    
    today_checkins = db.query(func.count(DropZoneCheckIn.id)).filter(
        and_(
            DropZoneCheckIn.dropzone_id == dropzone_id,
            DropZoneCheckIn.checked_in_at >= laces_service.start_of_utc_day()
        )
    ).scalar()
    
    # Get recent check-ins (last 10)
    recent_checkins = db.query(DropZoneCheckIn).filter(
        DropZoneCheckIn.dropzone_id == dropzone_id
    ).order_by(DropZoneCheckIn.checked_in_at.desc()).limit(10).all()
    
    return {
        "id": dropzone.id,
        "name": dropzone.name,
        "description": dropzone.description,
        "owner_id": dropzone.owner_id,
        "center_lat": coords_result.lat,
        "center_lng": coords_result.lng,
        "radius_meters": dropzone.radius_meters,
        "check_in_radius": dropzone.check_in_radius,
        "status": dropzone.status.value,
        "starts_at": dropzone.starts_at,
        "ends_at": dropzone.ends_at,
        "rules": dropzone.rules,
        "tags": dropzone.tags,
        "is_public": dropzone.is_public,
        "created_at": dropzone.created_at,
        "stats": {
            "member_count": member_count,
            "total_checkins": total_checkins,
            "today_checkins": today_checkins
        },
        "recent_checkins": [
            {
                "id": checkin.id,
                "user_id": checkin.user_id,
                "message": checkin.message,
                "streak_count": checkin.streak_count,
                "points_earned": checkin.points_earned,
                "checked_in_at": checkin.checked_in_at
            } for checkin in recent_checkins
        ]
    }

@router.post("/v1/dropzones/{dropzone_id}/join")
def join_dropzone(
    dropzone_id: UUID4,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Join a dropzone as a member"""
    user_id = current_user.user_id
    lock_user(db, user_id)
    
    # Locked so two people cannot both take the last free place
    dropzone = db.query(DropZone).filter(DropZone.id == dropzone_id).with_for_update().first()
    if not dropzone:
        raise refuse(db, 404, "Dropzone not found")
    
    # There is no invitation mechanism yet, so nobody can join a private zone:
    # to an outsider it does not exist, and members are already in.
    if not dropzone.is_public and not is_member(db, dropzone_id, current_user):
        raise refuse(db, 404, "Dropzone not found")
    
    # Check if already a member
    existing_member = db.query(DropZoneMember).filter(
        and_(
            DropZoneMember.dropzone_id == dropzone_id,
            DropZoneMember.user_id == user_id
        )
    ).first()
    
    if existing_member:
        raise refuse(db, 400, "Already a member")
    
    if dropzone.max_capacity is not None:
        member_count = db.query(func.count(DropZoneMember.id)).filter(
            DropZoneMember.dropzone_id == dropzone_id
        ).scalar()
        if member_count >= dropzone.max_capacity:
            raise refuse(db, 409, "Dropzone is at capacity")
    
    # Add as member
    member = DropZoneMember(
        dropzone_id=dropzone_id,
        user_id=user_id,
        role=MemberRole.MEMBER,
        rsvp_status='going'
    )
    
    db.add(member)
    db.commit()
    
    return {"success": True, "message": "Successfully joined dropzone"}

