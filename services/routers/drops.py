"""
Drops API - Release calendar and drop tracking
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func
from pydantic import BaseModel

from services.database import get_db
from services.core.auth import get_current_active_user, get_current_admin_user
from services.models.drop import Drop, DropStatus
from services.models.user import User

router = APIRouter(prefix="/drops", tags=["drops"])

# Pydantic models
class DropCreate(BaseModel):
    brand: str
    sku: Optional[str] = None
    name: str
    description: Optional[str] = None
    release_at: Optional[datetime] = None
    retail_price: Optional[float] = None
    image_url: Optional[str] = None
    regions: Optional[List[str]] = None
    release_type: Optional[str] = None
    links: Optional[Dict[str, Any]] = None

class DropResponse(BaseModel):
    id: str
    brand: str
    sku: Optional[str]
    name: str
    description: Optional[str]
    release_at: Optional[datetime]
    retail_price: Optional[float]
    image_url: Optional[str]
    status: str
    regions: Optional[List[str]]
    release_type: Optional[str]
    links: Optional[Dict[str, Any]]
    hype_score: int
    interest_count: int
    signal_count: int
    is_featured: bool
    is_verified: bool
    time_until_drop: Dict[str, Any]
    store_count: int
    
    class Config:
        from_attributes = True

class DropsList(BaseModel):
    drops: List[DropResponse]
    total: int
    page: int
    per_page: int
    has_next: bool

@router.get("/", response_model=DropsList)
async def list_drops(
    brand: Optional[str] = Query(None, description="Filter by brand"),
    status: Optional[str] = Query(None, description="Filter by status"),
    region: Optional[str] = Query(None, description="Filter by region"),
    city: Optional[str] = Query(None, description="Filter by city (via stores)"),
    from_date: Optional[datetime] = Query(None, description="From release date"),
    to_date: Optional[datetime] = Query(None, description="To release date"),
    featured_only: bool = Query(False, description="Show only featured drops"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List drops with filtering and pagination"""
    
    # Base query
    query = db.query(Drop)
    
    # Apply filters
    if brand:
        query = query.filter(Drop.brand.ilike(f"%{brand}%"))
    
    if status:
        query = query.filter(Drop.status == status)
    
    if region:
        query = query.filter(Drop.regions.any(region))
    
    if city:
        # Filter by stores in city (join with stores table)
        from services.models.drop import DropStore
        from services.models.drop import Store
        query = query.join(DropStore).join(Store).filter(Store.city.ilike(f"%{city}%"))
    
    if from_date:
        query = query.filter(Drop.release_at >= from_date)
    
    if to_date:
        query = query.filter(Drop.release_at <= to_date)
    
    if featured_only:
        query = query.filter(Drop.is_featured == True)
    
    # Default date range if no dates specified (next 4 weeks)
    if not from_date and not to_date:
        now = datetime.utcnow()
        future_date = now + timedelta(weeks=4)
        query = query.filter(
            or_(
                Drop.release_at.is_(None),  # Include drops with no date
                and_(Drop.release_at >= now, Drop.release_at <= future_date)
            )
        )
    
    # Get total count
    total = query.count()
    
    # Apply ordering and pagination
    drops = query.order_by(
        desc(Drop.is_featured),  # Featured first
        Drop.release_at.asc().nulls_last(),  # Then by release date
        desc(Drop.hype_score)  # Then by hype
    ).offset((page - 1) * per_page).limit(per_page).all()
    
    # Convert to response format
    drop_responses = [
        DropResponse(
            id=str(drop.id),
            brand=drop.brand,
            sku=drop.sku,
            name=drop.name,
            description=drop.description,
            release_at=drop.release_at,
            retail_price=float(drop.retail_price) if drop.retail_price else None,
            image_url=drop.image_url,
            status=drop.status,
            regions=drop.regions,
            release_type=drop.release_type,
            links=drop.links,
            hype_score=drop.hype_score,
            interest_count=drop.interest_count,
            signal_count=drop.signal_count,
            is_featured=drop.is_featured,
            is_verified=drop.is_verified,
            time_until_drop=drop.get_time_until_drop(),
            store_count=len(drop.stores) if drop.stores else 0
        )
        for drop in drops
    ]
    
    return DropsList(
        drops=drop_responses,
        total=total,
        page=page,
        per_page=per_page,
        has_next=total > page * per_page
    )

@router.get("/{drop_id}", response_model=DropResponse)
async def get_drop(drop_id: str, db: Session = Depends(get_db)):
    """Get a specific drop by ID"""
    
    drop = db.query(Drop).filter(Drop.id == drop_id).first()
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    
    return DropResponse(
        id=str(drop.id),
        brand=drop.brand,
        sku=drop.sku,
        name=drop.name,
        description=drop.description,
        release_at=drop.release_at,
        retail_price=float(drop.retail_price) if drop.retail_price else None,
        image_url=drop.image_url,
        status=drop.status,
        regions=drop.regions,
        release_type=drop.release_type,
        links=drop.links,
        hype_score=drop.hype_score,
        interest_count=drop.interest_count,
        signal_count=drop.signal_count,
        is_featured=drop.is_featured,
        is_verified=drop.is_verified,
        time_until_drop=drop.get_time_until_drop(),
        store_count=len(drop.stores) if drop.stores else 0
    )

@router.post("/", response_model=DropResponse, status_code=status.HTTP_201_CREATED)
async def create_drop(
    drop_data: DropCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Create a new drop (admin only)"""
    
    # Check for duplicate by brand + name + release date
    existing = db.query(Drop).filter(
        and_(
            Drop.brand == drop_data.brand,
            Drop.name == drop_data.name,
            Drop.release_at == drop_data.release_at
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Drop with same brand, name, and release date already exists"
        )
    
    # Create drop
    drop = Drop(
        brand=drop_data.brand,
        sku=drop_data.sku,
        name=drop_data.name,
        description=drop_data.description,
        release_at=drop_data.release_at,
        retail_price=drop_data.retail_price,
        image_url=drop_data.image_url,
        regions=drop_data.regions,
        release_type=drop_data.release_type,
        links=drop_data.links,
        original_source="manual",
        is_verified=True  # Admin-created drops are verified
    )
    
    db.add(drop)
    db.commit()
    db.refresh(drop)
    
    return DropResponse(
        id=str(drop.id),
        brand=drop.brand,
        sku=drop.sku,
        name=drop.name,
        description=drop.description,
        release_at=drop.release_at,
        retail_price=float(drop.retail_price) if drop.retail_price else None,
        image_url=drop.image_url,
        status=drop.status,
        regions=drop.regions,
        release_type=drop.release_type,
        links=drop.links,
        hype_score=drop.hype_score,
        interest_count=drop.interest_count,
        signal_count=drop.signal_count,
        is_featured=drop.is_featured,
        is_verified=drop.is_verified,
        time_until_drop=drop.get_time_until_drop(),
        store_count=0
    )

@router.post("/{drop_id}/interest")
async def express_interest(
    drop_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Express interest in a drop"""
    
    drop = db.query(Drop).filter(Drop.id == drop_id).first()
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    
    # TODO: Track individual user interest to prevent duplicates
    # For now, just increment the counter
    drop.add_interest()
    db.commit()
    
    return {
        "message": "Interest recorded",
        "interest_count": drop.interest_count,
        "hype_score": drop.hype_score
    }

@router.get("/calendar/{city}")
async def get_city_calendar(
    city: str,
    weeks: int = Query(4, ge=1, le=12, description="Number of weeks to show"),
    db: Session = Depends(get_db)
):
    """Get drop calendar for a specific city"""
    
    # Calculate date range
    now = datetime.utcnow()
    end_date = now + timedelta(weeks=weeks)
    
    # Query drops in this city
    from services.models.drop import DropStore, Store
    
    drops = db.query(Drop).join(DropStore).join(Store).filter(
        and_(
            Store.city.ilike(f"%{city}%"),
            Drop.release_at >= now,
            Drop.release_at <= end_date,
            Drop.status.in_([DropStatus.UPCOMING, DropStatus.LIVE])
        )
    ).order_by(Drop.release_at).all()
    
    # Group by week
    calendar_weeks = []
    current_week_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    current_week_start -= timedelta(days=current_week_start.weekday())  # Start of week (Monday)
    
    for week_num in range(weeks):
        week_start = current_week_start + timedelta(weeks=week_num)
        week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
        
        week_drops = [
            drop for drop in drops
            if drop.release_at and week_start <= drop.release_at <= week_end
        ]
        
        calendar_weeks.append({
            "week_number": week_num + 1,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "drop_count": len(week_drops),
            "drops": [drop.to_dict() for drop in week_drops[:10]]  # Limit to 10 per week
        })
    
    return {
        "city": city,
        "weeks": weeks,
        "total_drops": len(drops),
        "calendar": calendar_weeks
    }

@router.get("/stats/overview")
async def get_drops_stats(db: Session = Depends(get_db)):
    """Get overall drop statistics"""
    
    now = datetime.utcnow()
    
    # Basic counts
    total_drops = db.query(Drop).count()
    upcoming_drops = db.query(Drop).filter(
        and_(
            Drop.status == DropStatus.UPCOMING,
            Drop.release_at >= now
        )
    ).count()
    
    live_drops = db.query(Drop).filter(Drop.status == DropStatus.LIVE).count()
    
    # Brand breakdown
    brand_stats = db.query(
        Drop.brand,
        func.count(Drop.id).label('count')
    ).group_by(Drop.brand).order_by(desc('count')).limit(10).all()
    
    # Release type breakdown
    type_stats = db.query(
        Drop.release_type,
        func.count(Drop.id).label('count')
    ).filter(Drop.release_type.isnot(None)).group_by(Drop.release_type).all()
    
    # This week's drops
    week_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start -= timedelta(days=week_start.weekday())
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    
    this_week_drops = db.query(Drop).filter(
        and_(
            Drop.release_at >= week_start,
            Drop.release_at <= week_end
        )
    ).count()
    
    return {
        "total_drops": total_drops,
        "upcoming_drops": upcoming_drops,
        "live_drops": live_drops,
        "this_week_drops": this_week_drops,
        "top_brands": [{"brand": b[0], "count": b[1]} for b in brand_stats],
        "release_types": [{"type": t[0] or "Unknown", "count": t[1]} for t in type_stats]
    }