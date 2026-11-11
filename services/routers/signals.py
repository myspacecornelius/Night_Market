"""
Signals API - Enhanced geospatial signals for the sneaker community
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, List, Literal, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, desc, or_
from pydantic import BaseModel, Field, validator

from services.core.cache import CacheStrategy
from services.core.geospatial import BBox, parse_bbox, point_lat, point_lng, within_bbox
from services.database import get_db
from services.core.auth import get_current_active_user
from services.core.redis_client import get_redis
from services.models.signal import Signal, SignalType
from services.models.user import User
from services.core.geohash_utils import GeohashUtils, SignalAggregator
from worker.processors.signal_processing import refresh_heatmap_cache

router = APIRouter(prefix="/signals", tags=["signals"])

# Query filters are typed so that an unknown value is a 422, not a database error
SignalTypeName = Literal[
    'SPOTTED', 'STOCK_CHECK', 'LINE_UPDATE', 'INTEL_REPORT', 'HEAT_CHECK', 'DROP_ALERT', 'GENERAL'
]
TimeWindow = Literal["1h", "24h", "7d"]

# Simple city filtering - in production, use proper geocoding.
# Boxes are (min_lng, min_lat, max_lng, max_lat), the order parse_bbox returns.
CITY_BOUNDS: Dict[str, BBox] = {
    "boston": (-71.2, 42.3, -71.0, 42.4),
    "nyc": (-74.1, 40.6, -73.9, 40.8),
    "la": (-118.3, 33.9, -118.1, 34.1),
    "chicago": (-87.8, 41.8, -87.6, 42.0),
}

# PostgreSQL text cannot hold a NUL character: reject it here, not in the driver
NO_NUL = r"^[^\x00]*$"
Tag = Annotated[str, Field(min_length=1, max_length=50, pattern=NO_NUL)]

# Keeps OFFSET = (page - 1) * per_page far inside PostgreSQL's bigint range
MAX_PAGE = 100_000


def _city_for_point(latitude: float, longitude: float) -> Optional[str]:
    """Name of the known city whose box contains the point, if any."""
    for name, (min_lng, min_lat, max_lng, max_lat) in CITY_BOUNDS.items():
        if min_lng <= longitude <= max_lng and min_lat <= latitude <= max_lat:
            return name
    return None


def _parse_bbox_or_400(bbox: str) -> BBox:
    try:
        return parse_bbox(bbox)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid bbox format: {exc}") from exc


def _not_expired(now: datetime):
    """Filter clause: the signal has no expiry, or its expiry is still ahead."""
    return or_(Signal.expires_at.is_(None), Signal.expires_at > now)


# Pydantic models for request/response
class SignalCreate(BaseModel):
    latitude: float
    longitude: float
    signal_type: str
    text_content: Optional[str] = Field(None, max_length=5000, pattern=NO_NUL)
    media_url: Optional[str] = Field(None, max_length=500, pattern=NO_NUL)
    tags: Optional[List[Tag]] = Field(None, max_length=20)
    brand: Optional[str] = Field(None, max_length=100, pattern=NO_NUL)
    product_sku: Optional[str] = Field(None, max_length=100, pattern=NO_NUL)
    visibility: str = "public"
    expires_hours: Optional[int] = Field(None, ge=1, le=720)  # one hour to thirty days

    @validator('signal_type')
    def validate_signal_type(cls, v):
        valid_types = ['SPOTTED', 'STOCK_CHECK', 'LINE_UPDATE', 'INTEL_REPORT', 'HEAT_CHECK', 'DROP_ALERT', 'GENERAL']
        if v not in valid_types:
            raise ValueError(f'signal_type must be one of {valid_types}')
        return v
    
    @validator('visibility')
    def validate_visibility(cls, v):
        valid_visibility = ['public', 'local', 'followers', 'private']
        if v not in valid_visibility:
            raise ValueError(f'visibility must be one of {valid_visibility}')
        return v
    
    @validator('latitude')
    def validate_latitude(cls, v):
        if not -90 <= v <= 90:
            raise ValueError('latitude must be between -90 and 90')
        return v
    
    @validator('longitude')  
    def validate_longitude(cls, v):
        if not -180 <= v <= 180:
            raise ValueError('longitude must be between -180 and 180')
        return v

class SignalResponse(BaseModel):
    id: str
    user_id: str
    latitude: float
    longitude: float
    geohash: str
    signal_type: str
    text_content: Optional[str]
    media_url: Optional[str]
    tags: Optional[List[str]]
    brand: Optional[str]
    reputation_score: int
    boost_count: int
    view_count: int
    is_verified: bool
    created_at: datetime
    visibility: str
    
    class Config:
        from_attributes = True

class SignalList(BaseModel):
    signals: List[SignalResponse]
    total: int
    page: int
    per_page: int
    has_next: bool

@router.post("/", response_model=SignalResponse, status_code=status.HTTP_201_CREATED)
def create_signal(
    signal_data: SignalCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new signal"""
    now = datetime.now(timezone.utc)
    
    # Check user's recent signal count (basic rate limiting)
    recent_signals = db.query(Signal).filter(
        and_(
            Signal.user_id == current_user.user_id,
            Signal.created_at >= now - timedelta(minutes=15)
        )
    ).count()
    
    if recent_signals >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many signals created recently. Please wait before creating another."
        )
    
    # Create signal
    signal = Signal(
        user_id=current_user.user_id,
        signal_type=signal_data.signal_type,
        text_content=signal_data.text_content,
        media_url=signal_data.media_url,
        tags=signal_data.tags,
        brand=signal_data.brand,
        product_sku=signal_data.product_sku,
        visibility=signal_data.visibility,
        city=_city_for_point(signal_data.latitude, signal_data.longitude)
    )
    
    # Set coordinates and geohash
    signal.geohash = GeohashUtils.encode(signal_data.latitude, signal_data.longitude)
    
    # Create PostGIS point
    signal.geom = func.ST_SetSRID(func.ST_MakePoint(signal_data.longitude, signal_data.latitude), 4326)
    
    # Set expiration if specified
    if signal_data.expires_hours:
        signal.expires_at = now + timedelta(hours=signal_data.expires_hours)
    
    # Generate dedupe hash
    signal.generate_dedupe_hash_for_instance()
    
    # Check for duplicates in the last hour
    duplicate = db.query(Signal).filter(
        and_(
            Signal.dedupe_hash == signal.dedupe_hash,
            Signal.created_at >= now - timedelta(hours=1)
        )
    ).first()
    
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Similar signal already exists in this location"
        )
    
    # Save signal
    db.add(signal)
    db.commit()
    db.refresh(signal)
    
    # Update user stats
    current_user.total_posts += 1
    db.commit()
    
    # Trigger background tasks
    try:
        # Refresh heatmap cache for affected area
        refresh_heatmap_cache.delay(precision_levels=[6, 7], time_windows=[1, 24])
    except Exception:
        pass  # Don't fail request if background task fails
    
    return SignalResponse(
        id=str(signal.id),
        user_id=str(signal.user_id),
        latitude=signal_data.latitude,
        longitude=signal_data.longitude,
        geohash=signal.geohash,
        signal_type=signal.signal_type,
        text_content=signal.text_content,
        media_url=signal.media_url,
        tags=signal.tags,
        brand=signal.brand,
        reputation_score=signal.reputation_score,
        boost_count=signal.boost_count,
        view_count=signal.view_count,
        is_verified=signal.is_verified,
        created_at=signal.created_at,
        visibility=signal.visibility
    )

@router.get("/", response_model=SignalList)
def list_signals(
    bbox: Optional[str] = Query(None, description="Bounding box: min_lng,min_lat,max_lng,max_lat"),
    city: Optional[str] = Query(None, description="Filter by city"),
    signal_type: Optional[SignalTypeName] = Query(None, description="Filter by signal type"),
    brand: Optional[str] = Query(None, max_length=100, pattern=NO_NUL, description="Filter by brand"),
    tags: Optional[str] = Query(
        None, max_length=500, pattern=NO_NUL, description="Filter by tags (comma-separated)"
    ),
    time_window: TimeWindow = Query("24h", description="Time window: 1h, 24h, 7d"),
    page: int = Query(1, ge=1, le=MAX_PAGE),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List signals with filtering and pagination"""
    
    # Calculate time window
    time_windows = {"1h": 1, "24h": 24, "7d": 168}
    hours = time_windows.get(time_window, 24)
    now = datetime.now(timezone.utc)
    cutoff_time = now - timedelta(hours=hours)
    
    # Base query for active signals
    query = db.query(Signal).filter(
        and_(
            Signal.created_at >= cutoff_time,
            Signal.is_flagged == False,
            Signal.visibility.in_(['public', 'local']),
            _not_expired(now)
        )
    )
    
    # Apply filters
    if bbox:
        query = query.filter(within_bbox(Signal.geom, _parse_bbox_or_400(bbox)))
    
    if city:
        city_bbox = CITY_BOUNDS.get(city.strip().lower())
        if city_bbox is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown city. Supported cities: {', '.join(sorted(CITY_BOUNDS))}"
            )
        query = query.filter(within_bbox(Signal.geom, city_bbox))
    
    if signal_type:
        query = query.filter(Signal.signal_type == signal_type)
    
    if brand:
        query = query.filter(Signal.brand.ilike(f"%{brand}%"))
    
    if tags:
        tag_list = [t.strip() for t in tags.split(',') if t.strip()]
        for tag in tag_list:
            query = query.filter(Signal.tags.any(tag))
    
    # Get total count
    total = query.count()
    
    # Include coordinates with pagination
    signals_with_coords = (
        query.with_entities(
            Signal,
            point_lat(Signal.geom).label("lat"),
            point_lng(Signal.geom).label("lng"),
        )
        .order_by(desc(Signal.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    
    signal_responses = []
    for signal, lat, lng in signals_with_coords:
        signal_responses.append(SignalResponse(
            id=str(signal.id),
            user_id=str(signal.user_id),
            latitude=lat,
            longitude=lng,
            geohash=signal.geohash,
            signal_type=signal.signal_type,
            text_content=signal.text_content,
            media_url=signal.media_url,
            tags=signal.tags,
            brand=signal.brand,
            reputation_score=signal.reputation_score,
            boost_count=signal.boost_count,
            view_count=signal.view_count,
            is_verified=signal.is_verified,
            created_at=signal.created_at,
            visibility=signal.visibility
        ))
    
    return SignalList(
        signals=signal_responses,
        total=total,
        page=page,
        per_page=per_page,
        has_next=total > page * per_page
    )

@router.get("/heatmap")
async def get_signal_heatmap(
    bbox: Optional[str] = Query(None, description="Bounding box: min_lng,min_lat,max_lng,max_lat"),
    zoom: Optional[int] = Query(7, ge=4, le=10, description="Geohash precision level"),
    time_window: TimeWindow = Query("24h", description="Time window: 1h, 24h, 7d"),
    redis_client = Depends(get_redis),
    db: Session = Depends(get_db)
):
    """Get aggregated heatmap data for signals"""
    
    # Parse time window
    time_windows = {"1h": 1, "24h": 24, "7d": 168}
    hours = time_windows.get(time_window, 24)
    parsed_bbox = _parse_bbox_or_400(bbox) if bbox else None
    
    # "api" keeps these payloads apart from the raw buckets that the worker
    # caches under signals:heatmap:{precision}:{hours}h
    cache_key = f"signals:heatmap:api:{zoom}:{hours}h"
    if bbox:
        cache_key += f":bbox:{bbox}"

    tier = "hot" if hours <= 1 else "warm"
    cache = CacheStrategy(redis_client)

    async def _build_payload():
        now = datetime.now(timezone.utc)
        cutoff_time = now - timedelta(hours=hours)
        query = db.query(Signal).filter(
            and_(
                Signal.created_at >= cutoff_time,
                Signal.is_flagged == False,
                Signal.visibility.in_(['public', 'local']),
                _not_expired(now)
            )
        )

        if parsed_bbox:
            query = query.filter(within_bbox(Signal.geom, parsed_bbox))

        signal_rows = query.with_entities(
            Signal,
            point_lat(Signal.geom).label("lat"),
            point_lng(Signal.geom).label("lng"),
        ).all()

        signal_dicts = [
            {
                'id': str(signal.id),
                'lat': lat,
                'lng': lng,
                'geohash': signal.geohash,
                'signal_type': signal.signal_type,
                'reputation_score': signal.reputation_score,
                'brand': signal.brand,
                'tags': signal.tags or [],
                'text_content': signal.text_content,
                'created_at': signal.created_at,
            }
            for signal, lat, lng in signal_rows
        ]

        # The query above is the only filter. Re-applying the time window here
        # (against a slightly later clock) or the bbox (against cell centres,
        # which can lie outside a box smaller than the cell) would drop signals
        # that total_signals has already counted.
        aggregated = SignalAggregator.aggregate_by_geohash(signal_dicts, precision=zoom)

        top_buckets = SignalAggregator.get_top_buckets(aggregated, limit=100)

        return {
            "buckets": top_buckets,
            "total_signals": len(signal_dicts),
            "total_buckets": len(top_buckets),
            "time_window": time_window,
            "zoom_level": zoom,
            "bbox": bbox.split(',') if bbox else None
        }

    payload = await cache.get_or_set(cache_key, loader=_build_payload, tier=tier)
    return JSONResponse(content=payload)

@router.post("/{signal_id}/boost")
def boost_signal(
    signal_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Boost a signal (like/upvote)"""
    
    signal = db.query(Signal).filter(Signal.id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    if signal.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot boost your own signal")
    
    # TODO: Check if user already boosted this signal (need boost tracking table)
    
    # Boost the signal
    signal.boost()
    db.commit()
    
    return {"message": "Signal boosted", "boost_count": signal.boost_count}

@router.get("/stats")
def get_signal_stats(
    time_window: TimeWindow = Query("24h", description="Time window: 1h, 24h, 7d"),
    db: Session = Depends(get_db)
):
    """Get signal statistics"""
    
    # Parse time window
    time_windows = {"1h": 1, "24h": 24, "7d": 168}
    hours = time_windows.get(time_window, 24)
    now = datetime.now(timezone.utc)
    cutoff_time = now - timedelta(hours=hours)
    
    # Signals created in the window that have not expired
    in_window = and_(Signal.created_at >= cutoff_time, _not_expired(now))
    
    # Basic stats
    total_signals = db.query(Signal).filter(in_window).count()
    active_signals = db.query(Signal).filter(
        and_(
            in_window,
            Signal.is_flagged == False
        )
    ).count()
    
    # Signal type breakdown
    type_stats = db.query(
        Signal.signal_type,
        func.count(Signal.id).label('count')
    ).filter(
        in_window
    ).group_by(Signal.signal_type).all()
    
    # Brand breakdown
    brand_stats = db.query(
        Signal.brand,
        func.count(Signal.id).label('count')
    ).filter(
        and_(
            in_window,
            Signal.brand.isnot(None)
        )
    ).group_by(Signal.brand).order_by(desc('count')).limit(10).all()
    
    return {
        "time_window": time_window,
        "total_signals": total_signals,
        "active_signals": active_signals,
        "flagged_signals": total_signals - active_signals,
        "signal_types": [{"type": t[0], "count": t[1]} for t in type_stats],
        "top_brands": [{"brand": b[0], "count": b[1]} for b in brand_stats]
    }
