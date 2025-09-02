from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text, and_, or_
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel, UUID4
import uuid
import math

from backend.database import get_db
from backend.models.dropzone import DropZone, DropZoneMember, DropZoneCheckIn, DropZoneStatus, MemberRole
from backend.models.user import User

router = APIRouter()

# Pydantic models for API
class DropZoneCreate(BaseModel):
    name: str
    description: Optional[str] = None
    center_lat: float
    center_lng: float
    radius_meters: float = 100.0
    check_in_radius: float = 50.0
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_capacity: Optional[int] = None
    rules: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: bool = True

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
    lat: float
    lng: float
    message: Optional[str] = None
    photo_url: Optional[str] = None

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
async def create_dropzone(
    dropzone_data: DropZoneCreate,
    db: Session = Depends(get_db)
    # TODO: Add authentication to get current_user
):
    """Create a new dropzone"""
    # For now, use a placeholder user ID - in production this would come from auth
    owner_id = uuid.uuid4()  # TODO: Replace with current_user.user_id
    
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
        status=DropZoneStatus.SCHEDULED if dropzone_data.starts_at else DropZoneStatus.ACTIVE
    )
    
    db.add(dropzone)
    db.commit()
    db.refresh(dropzone)
    
    # Add owner as member with OWNER role
    owner_member = DropZoneMember(
        dropzone_id=dropzone.id,
        user_id=owner_id,
        role=MemberRole.OWNER,
        rsvp_status='going'
    )
    db.add(owner_member)
    db.commit()
    
    # Get coordinates back from PostGIS for response
    coords_result = db.execute(
        text("SELECT ST_X(:point) as lng, ST_Y(:point) as lat"),
        {"point": dropzone.center_point}
    ).fetchone()
    
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
async def list_dropzones(
    bbox: Optional[str] = Query(None, description="Bounding box: min_lng,min_lat,max_lng,max_lat"),
    active: Optional[bool] = Query(None, description="Filter by active status"),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    """List dropzones with optional spatial filtering"""
    query = db.query(DropZone)
    
    # Filter by status if active parameter provided
    if active is not None:
        if active:
            now = datetime.utcnow()
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
            min_lng, min_lat, max_lng, max_lat = [float(x) for x in bbox.split(',')]
            bbox_geom = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
            query = query.filter(func.ST_Intersects(DropZone.center_point, bbox_geom))
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    # Apply pagination
    dropzones = query.offset(offset).limit(limit).all()
    
    # Build response with computed fields
    results = []
    for dropzone in dropzones:
        # Get coordinates from PostGIS
        coords_result = db.execute(
            text("SELECT ST_X(:point) as lng, ST_Y(:point) as lat"),
            {"point": dropzone.center_point}
        ).fetchone()
        
        # Count members and check-ins
        member_count = db.query(func.count(DropZoneMember.id)).filter(
            DropZoneMember.dropzone_id == dropzone.id
        ).scalar()
        
        check_in_count = db.query(func.count(DropZoneCheckIn.id)).filter(
            DropZoneCheckIn.dropzone_id == dropzone.id
        ).scalar()
        
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
async def check_in_to_dropzone(
    dropzone_id: UUID4,
    check_in_data: CheckInRequest,
    db: Session = Depends(get_db)
    # TODO: Add authentication to get current_user
):
    """Check in to a dropzone with location verification"""
    # Get dropzone
    dropzone = db.query(DropZone).filter(DropZone.id == dropzone_id).first()
    if not dropzone:
        raise HTTPException(status_code=404, detail="Dropzone not found")
    
    # Check if dropzone is active
    now = datetime.utcnow()
    if dropzone.status != DropZoneStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Dropzone is not active")
    
    if dropzone.starts_at and dropzone.starts_at > now:
        raise HTTPException(status_code=400, detail="Dropzone has not started yet")
    
    if dropzone.ends_at and dropzone.ends_at < now:
        raise HTTPException(status_code=400, detail="Dropzone has ended")
    
    # Get dropzone center coordinates
    coords_result = db.execute(
        text("SELECT ST_X(:point) as lng, ST_Y(:point) as lat"),
        {"point": dropzone.center_point}
    ).fetchone()
    
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
    
    # TODO: Get current user from authentication
    user_id = uuid.uuid4()  # Placeholder
    
    # Check if user already checked in today
    today = datetime.now().date()
    existing_checkin = db.query(DropZoneCheckIn).filter(
        and_(
            DropZoneCheckIn.dropzone_id == dropzone_id,
            DropZoneCheckIn.user_id == user_id,
            func.date(DropZoneCheckIn.checked_in_at) == today
        )
    ).first()
    
    if existing_checkin:
        raise HTTPException(status_code=400, detail="Already checked in today")
    
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
        last_date = last_checkin.checked_in_at.date()
        yesterday = (datetime.now() - timedelta(days=1)).date()
        
        if last_date == yesterday:
            streak_count = last_checkin.streak_count + 1
        # If there's a gap, streak resets to 1
    
    # Calculate points based on streak
    base_points = 10
    streak_bonus = min(streak_count - 1, 10) * 2  # Max 20 bonus points
    total_points = base_points + streak_bonus
    
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
        points_earned=total_points
    )
    
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    
    return {
        "success": True,
        "check_in_id": checkin.id,
        "distance_from_center": distance,
        "streak_count": streak_count,
        "points_earned": total_points,
        "message": f"Successfully checked in! Streak: {streak_count}, Points: {total_points}"
    }

@router.get("/v1/dropzones/{dropzone_id}")
async def get_dropzone_details(
    dropzone_id: UUID4,
    db: Session = Depends(get_db)
):
    """Get detailed information about a dropzone"""
    dropzone = db.query(DropZone).filter(DropZone.id == dropzone_id).first()
    if not dropzone:
        raise HTTPException(status_code=404, detail="Dropzone not found")
    
    # Get coordinates from PostGIS
    coords_result = db.execute(
        text("SELECT ST_X(:point) as lng, ST_Y(:point) as lat"),
        {"point": dropzone.center_point}
    ).fetchone()
    
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
            func.date(DropZoneCheckIn.checked_in_at) == datetime.now().date()
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
async def join_dropzone(
    dropzone_id: UUID4,
    db: Session = Depends(get_db)
    # TODO: Add authentication
):
    """Join a dropzone as a member"""
    user_id = uuid.uuid4()  # TODO: Get from auth
    
    # Check if already a member
    existing_member = db.query(DropZoneMember).filter(
        and_(
            DropZoneMember.dropzone_id == dropzone_id,
            DropZoneMember.user_id == user_id
        )
    ).first()
    
    if existing_member:
        raise HTTPException(status_code=400, detail="Already a member")
    
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

