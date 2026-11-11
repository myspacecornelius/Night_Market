"""
Drops API - Release calendar and drop tracking
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Iterable, List, Literal, Optional, Dict, Any, Set
from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, case, delete, desc, func, select, update
from sqlalchemy.dialects.postgresql import insert
from pydantic import BaseModel, Field, StringConstraints, field_validator

from services.database import get_db
from services.core.auth import get_current_active_user, get_current_admin_user, get_optional_user
from services.models.drop import Drop, DropStatus, DropStore, as_utc, release_at_utc
from services.models.drop_interest import DropInterest
from services.models.user import User

router = APIRouter(prefix="/drops", tags=["drops"])

# The values of drop_status_enum; anything else is a 422, not a database error
DropStatusName = Literal['upcoming', 'live', 'sold_out', 'delayed', 'cancelled', 'ended']

# drops.retail_price is numeric(10, 2)
MAX_RETAIL_PRICE = 99_999_999.99

# Keeps OFFSET = (page - 1) * per_page far inside PostgreSQL's bigint range
MAX_PAGE = 100_000

# Pydantic models
class DropCreate(BaseModel):
    # Surrounding whitespace is dropped, and what is left must not be empty
    brand: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    sku: Optional[str] = Field(None, max_length=100)
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    description: Optional[str] = None
    release_at: Optional[datetime] = None
    retail_price: Optional[float] = Field(None, ge=0, le=MAX_RETAIL_PRICE)
    image_url: Optional[str] = Field(None, max_length=500)
    regions: Optional[List[str]] = None
    release_type: Optional[str] = Field(None, max_length=50)
    links: Optional[Dict[str, Any]] = None

    @field_validator('release_at')
    @classmethod
    def release_at_in_utc(cls, value: Optional[datetime]) -> Optional[datetime]:
        """A release date sent without an offset is UTC, whatever the database
        session's time zone. One at the very ends of the calendar could be
        stored but not read back, so it is turned down here."""
        return release_at_utc(value) if value is not None else None

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
    # Whether the caller follows the drop; false for a caller who is not signed in
    is_following: bool
    
    class Config:
        from_attributes = True

class DropsList(BaseModel):
    drops: List[DropResponse]
    total: int
    page: int
    per_page: int
    has_next: bool

class DropFollowState(BaseModel):
    following: bool
    interest_count: int
    hype_score: int

def _followed_ids(db: Session, user: Optional[User], drops: Iterable[Drop]) -> Set[uuid.UUID]:
    """The ids of those drops the user follows: one query for a whole page of drops."""
    drop_ids = [drop.id for drop in drops]
    if user is None or not drop_ids:
        return set()
    return set(db.execute(
        select(DropInterest.drop_id).where(
            DropInterest.user_id == user.user_id,
            DropInterest.drop_id.in_(drop_ids)
        )
    ).scalars())

def _store_counts(db: Session, drops: Iterable[Drop]) -> Dict[uuid.UUID, int]:
    """How many stores carry each of those drops: one query for a whole page of drops.

    Drops no store carries are not in the result. len(drop.stores) would read every
    store of every drop, one query per drop, only to count them.
    """
    drop_ids = [drop.id for drop in drops]
    if not drop_ids:
        return {}
    rows = db.execute(
        select(DropStore.drop_id, func.count())
        .where(DropStore.drop_id.in_(drop_ids))
        .group_by(DropStore.drop_id)
    ).all()
    return {drop_id: count for drop_id, count in rows}

def _drop_response(drop: Drop, is_following: bool, store_count: int) -> DropResponse:
    """A drop as the API returns it. The store count comes from _store_counts()."""
    return DropResponse(
        id=str(drop.id),
        brand=drop.brand,
        sku=drop.sku,
        name=drop.name,
        description=drop.description,
        release_at=drop.release_at,
        retail_price=float(drop.retail_price) if drop.retail_price is not None else None,
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
        store_count=store_count,
        is_following=is_following
    )

def _record_follow_change(db: Session, drop_id: uuid.UUID, following: bool, changed: bool) -> DropFollowState:
    """Finish a follow or an unfollow: count it if a row was written, commit, report.

    The counters move only when a drop_interests row was really inserted or deleted,
    and in the same transaction, so interest_count stays the number of rows. The
    database adds to the row as it is at that moment: Drop.add_interest() adds one
    to the value this request read, and of two followers arriving together only one
    was counted. A follow is worth one hype point, and unfollowing gives it back.
    """
    if changed:
        step = 1 if following else -1
        counters = db.execute(
            update(Drop)
            .where(Drop.id == drop_id)
            .values(
                # Never below zero (both columns have a CHECK): a follow that was not
                # counted, or hype that was reset since, must not make unfollowing fail
                interest_count=func.greatest(Drop.interest_count + step, 0),
                hype_score=func.greatest(Drop.hype_score + step, 0)
            )
            .returning(Drop.interest_count, Drop.hype_score)
        ).first()
    else:
        counters = db.execute(
            select(Drop.interest_count, Drop.hype_score).where(Drop.id == drop_id)
        ).first()

    if counters is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Drop not found")

    db.commit()
    return DropFollowState(
        following=following,
        interest_count=counters.interest_count,
        hype_score=counters.hype_score
    )

@router.get("/", response_model=DropsList)
def list_drops(
    brand: Optional[str] = Query(None, description="Filter by brand"),
    status: Optional[DropStatusName] = Query(None, description="Filter by status"),
    region: Optional[str] = Query(None, description="Filter by region"),
    city: Optional[str] = Query(None, description="Filter by city (via stores)"),
    from_date: Optional[datetime] = Query(None, description="From release date"),
    to_date: Optional[datetime] = Query(None, description="To release date"),
    featured_only: bool = Query(False, description="Show only featured drops"),
    page: int = Query(1, ge=1, le=MAX_PAGE),
    per_page: int = Query(20, ge=1, le=100),
    current_user: Optional[User] = Depends(get_optional_user),
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
        # Filter by stores in city. EXISTS rather than a join: a drop sold at
        # several stores in the city is still one row for total and paging
        from services.models.drop import Store
        query = query.filter(Drop.stores.any(Store.city.ilike(f"%{city}%")))
    
    if from_date:
        query = query.filter(Drop.release_at >= as_utc(from_date))
    
    if to_date:
        query = query.filter(Drop.release_at <= as_utc(to_date))
    
    if featured_only:
        query = query.filter(Drop.is_featured == True)
    
    # Default date range if no dates specified (next 4 weeks)
    if not from_date and not to_date:
        now = datetime.now(timezone.utc)
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
        desc(Drop.hype_score),  # Then by hype
        Drop.id  # Drops that tie keep one order, so no page repeats or skips one
    ).offset((page - 1) * per_page).limit(per_page).all()
    
    # Convert to response format
    followed = _followed_ids(db, current_user, drops)
    store_counts = _store_counts(db, drops)
    drop_responses = [
        _drop_response(drop, drop.id in followed, store_counts.get(drop.id, 0)) for drop in drops
    ]
    
    return DropsList(
        drops=drop_responses,
        total=total,
        page=page,
        per_page=per_page,
        has_next=total > page * per_page
    )

# Declared before /{drop_id}, which would otherwise take "following" for a drop id
@router.get("/following", response_model=DropsList)
def list_followed_drops(
    upcoming_only: bool = Query(True, description="Leave out drops whose release date has passed"),
    page: int = Query(1, ge=1, le=MAX_PAGE),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """The drops the caller follows, soonest release first"""
    
    now = datetime.now(timezone.utc)
    released = and_(Drop.release_at.isnot(None), Drop.release_at < now)
    
    # At most one drop_interests row per user and drop: the join adds no duplicates
    query = db.query(Drop).join(DropInterest, DropInterest.drop_id == Drop.id).filter(
        DropInterest.user_id == current_user.user_id
    )
    
    if upcoming_only:
        query = query.filter(or_(Drop.release_at.is_(None), Drop.release_at >= now))
    
    total = query.count()
    
    drops = query.order_by(
        released,  # What is still to come first...
        case((~released, Drop.release_at)).asc().nulls_last(),  # ...soonest first, no date last
        Drop.release_at.desc(),  # Then what has been released, most recent first
        Drop.id  # The same order on every page
    ).offset((page - 1) * per_page).limit(per_page).all()
    
    store_counts = _store_counts(db, drops)
    
    return DropsList(
        drops=[_drop_response(drop, True, store_counts.get(drop.id, 0)) for drop in drops],
        total=total,
        page=page,
        per_page=per_page,
        has_next=total > page * per_page
    )

@router.get("/{drop_id}", response_model=DropResponse)
def get_drop(
    drop_id: uuid.UUID,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Get a specific drop by ID"""
    
    drop = db.query(Drop).filter(Drop.id == drop_id).first()
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    
    return _drop_response(
        drop,
        drop.id in _followed_ids(db, current_user, [drop]),
        _store_counts(db, [drop]).get(drop.id, 0)
    )

@router.post("/", response_model=DropResponse, status_code=status.HTTP_201_CREATED)
def create_drop(
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
    db.flush()
    db.refresh(drop)
    
    # Build the response before committing: if it cannot be built, nothing is
    # saved and the client can retry instead of hitting the duplicate check
    response = _drop_response(drop, False, 0)
    db.commit()
    return response

@router.post("/{drop_id}/interest", response_model=DropFollowState)
def follow_drop(
    drop_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Follow a drop. Following it again changes nothing."""
    
    if db.query(Drop.id).filter(Drop.id == drop_id).first() is None:
        raise HTTPException(status_code=404, detail="Drop not found")
    
    # One row per user and drop. A second follow inserts nothing, also when it
    # arrives while the first is still in flight: it waits for that one, then skips
    inserted = db.execute(
        insert(DropInterest)
        .values(drop_id=drop_id, user_id=current_user.user_id)
        .on_conflict_do_nothing(index_elements=[DropInterest.drop_id, DropInterest.user_id])
    ).rowcount
    
    return _record_follow_change(db, drop_id, following=True, changed=inserted > 0)

@router.delete("/{drop_id}/interest", response_model=DropFollowState)
def unfollow_drop(
    drop_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Stop following a drop. Unfollowing a drop that is not followed changes nothing."""
    
    deleted = db.execute(
        delete(DropInterest).where(
            DropInterest.drop_id == drop_id,
            DropInterest.user_id == current_user.user_id
        )
    ).rowcount
    
    # An unknown drop has no rows to delete; it is reported as a 404 there
    return _record_follow_change(db, drop_id, following=False, changed=deleted > 0)

@router.get("/calendar/{city}")
def get_city_calendar(
    city: str,
    weeks: int = Query(4, ge=1, le=12, description="Number of weeks to show"),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Get drop calendar for a specific city"""
    
    # Calculate date range
    now = datetime.now(timezone.utc)
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
        next_week_start = week_start + timedelta(weeks=1)
        
        week_drops = [
            drop for drop in drops
            if drop.release_at and week_start <= as_utc(drop.release_at) < next_week_start
        ]
        
        calendar_weeks.append({
            "week_number": week_num + 1,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "drop_count": len(week_drops),
            "drops": week_drops[:10]  # Limit to 10 per week
        })
    
    # One lookup each for every drop shown, whichever week it is in. The entries are
    # Drop.to_dict() plus is_following; to_dict() itself would read the stores of each
    # drop separately to count them
    shown = [drop for week in calendar_weeks for drop in week["drops"]]
    followed = _followed_ids(db, current_user, shown)
    store_counts = _store_counts(db, shown)
    for week in calendar_weeks:
        week["drops"] = [
            {
                **_drop_response(drop, drop.id in followed, store_counts.get(drop.id, 0)).model_dump(),
                "release_at": drop.release_at.isoformat() if drop.release_at else None
            }
            for drop in week["drops"]
        ]
    
    return {
        "city": city,
        "weeks": weeks,
        "total_drops": len(drops),
        "calendar": calendar_weeks
    }

@router.get("/stats/overview")
def get_drops_stats(db: Session = Depends(get_db)):
    """Get overall drop statistics"""
    
    now = datetime.now(timezone.utc)
    
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
    
    # This week's drops: Monday 00:00 UTC up to, not including, next Monday
    week_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start -= timedelta(days=week_start.weekday())
    
    this_week_drops = db.query(Drop).filter(
        and_(
            Drop.release_at >= week_start,
            Drop.release_at < week_start + timedelta(weeks=1)
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