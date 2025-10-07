"""
Signals API - Enhanced geospatial signals for the sneaker community
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, text, func, desc
from pydantic import BaseModel, validator
import json

from services.database import get_db
from services.core.auth import get_current_active_user
from services.core.redis_client import get_redis
from services.models.signal import Signal, SignalType
from services.models.user import User
from services.core.geohash_utils import GeohashUtils, SignalAggregator
from worker.processors.signal_processing import refresh_heatmap_cache

router = APIRouter(prefix="/signals", tags=["signals"])

# Pydantic models for request/response
class SignalCreate(BaseModel):
    latitude: float
    longitude: float
    signal_type: str
    text_content: Optional[str] = None
    media_url: Optional[str] = None
    tags: Optional[List[str]] = None
    brand: Optional[str] = None
    product_sku: Optional[str] = None
    visibility: str = "public"
    expires_hours: Optional[int] = None
    
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
async def create_signal(
    signal_data: SignalCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new signal"""
    
    # Check user's recent signal count (basic rate limiting)
    recent_signals = db.query(Signal).filter(
        and_(
            Signal.user_id == current_user.user_id,
            Signal.created_at >= datetime.utcnow() - timedelta(minutes=15)
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
        visibility=signal_data.visibility
    )
    
    # Set coordinates and geohash
    signal.geohash = GeohashUtils.encode(signal_data.latitude, signal_data.longitude)
    
    # Create PostGIS point
    signal.geom = func.ST_SetSRID(func.ST_MakePoint(signal_data.longitude, signal_data.latitude), 4326)
    
    # Set expiration if specified
    if signal_data.expires_hours:
        signal.expires_at = datetime.utcnow() + timedelta(hours=signal_data.expires_hours)
    
    # Generate dedupe hash
    signal.generate_dedupe_hash_for_instance()
    
    # Check for duplicates in the last hour
    duplicate = db.query(Signal).filter(
        and_(
            Signal.dedupe_hash == signal.dedupe_hash,
            Signal.created_at >= datetime.utcnow() - timedelta(hours=1)
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
    
    # Get coordinates for response
    coords = db.execute(
        text("SELECT ST_X(:geom) as lng, ST_Y(:geom) as lat"),
        {"geom": signal.geom}
    ).fetchone()
    
    return SignalResponse(
        id=str(signal.id),
        user_id=str(signal.user_id),
        latitude=coords.lat,
        longitude=coords.lng,
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
async def list_signals(
    bbox: Optional[str] = Query(None, description="Bounding box: min_lng,min_lat,max_lng,max_lat"),
    city: Optional[str] = Query(None, description="Filter by city"),
    signal_type: Optional[str] = Query(None, description="Filter by signal type"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    tags: Optional[str] = Query(None, description="Filter by tags (comma-separated)"),
    time_window: Optional[str] = Query("24h", description="Time window: 1h, 24h, 7d"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List signals with filtering and pagination"""
    
    # Calculate time window
    time_windows = {"1h": 1, "24h": 24, "7d": 168}
    hours = time_windows.get(time_window, 24)
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    
    # Base query for active signals
    query = db.query(Signal).filter(
        and_(
            Signal.created_at >= cutoff_time,
            Signal.is_flagged == False,
            Signal.visibility.in_(['public', 'local'])
        )
    )
    
    # Apply filters
    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = map(float, bbox.split(','))
            bbox_geom = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
            query = query.filter(func.ST_Intersects(Signal.geom, bbox_geom))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    if city:
        # Simple city filtering - in production, use proper geocoding
        city_filters = {
            "boston": "42.3,42.4,-71.2,-71.0",
            "nyc": "40.6,40.8,-74.1,-73.9", 
            "la": "33.9,34.1,-118.3,-118.1",
            "chicago": "41.8,42.0,-87.8,-87.6"
        }
        
        if city.lower() in city_filters:
            city_bbox = city_filters[city.lower()]
            min_lng, min_lat, max_lng, max_lat = map(float, city_bbox.split(','))
            bbox_geom = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
            query = query.filter(func.ST_Intersects(Signal.geom, bbox_geom))
    
    if signal_type:
        query = query.filter(Signal.signal_type == signal_type)
    
    if brand:
        query = query.filter(Signal.brand.ilike(f"%{brand}%"))
    
    if tags:
        tag_list = [t.strip() for t in tags.split(',')]
        for tag in tag_list:
            query = query.filter(Signal.tags.any(tag))
    
    # Get total count
    total = query.count()
    
    # Apply pagination and ordering
    signals = query.order_by(desc(Signal.created_at)).offset((page - 1) * per_page).limit(per_page).all()
    
    # Convert to response format
    signal_responses = []
    for signal in signals:
        # Get coordinates
        coords = db.execute(
            text("SELECT ST_X(:geom) as lng, ST_Y(:geom) as lat"),
            {"geom": signal.geom}
        ).fetchone()
        
        signal_responses.append(SignalResponse(
            id=str(signal.id),
            user_id=str(signal.user_id),
            latitude=coords.lat,
            longitude=coords.lng,
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
    time_window: Optional[str] = Query("24h", description="Time window: 1h, 24h, 7d"),
    redis_client = Depends(get_redis),
    db: Session = Depends(get_db)
):
    """Get aggregated heatmap data for signals"""
    
    # Parse time window
    time_windows = {"1h": 1, "24h": 24, "7d": 168}
    hours = time_windows.get(time_window, 24)
    
    # Try to get cached data first
    cache_key = f"signals:heatmap:{zoom}:{hours}h"
    if bbox:
        cache_key += f":bbox:{bbox}"
    
    cached_data = redis_client.get(cache_key)
    if cached_data:
        return JSONResponse(content=json.loads(cached_data))
    
    # If not cached, generate heatmap data
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    
    # Query active signals
    query = db.query(Signal).filter(
        and_(
            Signal.created_at >= cutoff_time,
            Signal.is_flagged == False,
            Signal.visibility.in_(['public', 'local'])
        )
    )
    
    # Apply bbox filter if provided
    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = map(float, bbox.split(','))
            bbox_geom = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
            query = query.filter(func.ST_Intersects(Signal.geom, bbox_geom))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    signals = query.all()
    
    # Convert to dict format for aggregation
    signal_dicts = []
    for signal in signals:
        coords = db.execute(
            text("SELECT ST_X(:geom) as lng, ST_Y(:geom) as lat"),
            {"geom": signal.geom}
        ).fetchone()
        
        signal_dicts.append({
            'id': str(signal.id),
            'lat': coords.lat,
            'lng': coords.lng,
            'geohash': signal.geohash,
            'signal_type': signal.signal_type,
            'reputation_score': signal.reputation_score,
            'brand': signal.brand,
            'tags': signal.tags or [],
            'text_content': signal.text_content,
            'created_at': signal.created_at
        })
    
    # Aggregate by geohash
    aggregated = SignalAggregator.aggregate_by_geohash(
        signal_dicts,
        precision=zoom,
        time_window_hours=hours
    )
    
    # Filter by bbox if provided
    if bbox:
        bbox_list = [float(x) for x in bbox.split(',')]
        aggregated = SignalAggregator.filter_by_bbox(aggregated, bbox_list)
    
    # Get top buckets
    top_buckets = SignalAggregator.get_top_buckets(aggregated, limit=100)
    
    response_data = {
        "buckets": top_buckets,
        "total_signals": len(signal_dicts),
        "total_buckets": len(top_buckets),
        "time_window": time_window,
        "zoom_level": zoom,
        "bbox": bbox.split(',') if bbox else None
    }
    
    # Cache the result
    cache_ttl = {1: 180, 24: 300, 168: 900}.get(hours, 300)  # Cache TTL based on time window
    redis_client.setex(cache_key, cache_ttl, json.dumps(response_data, default=str))
    
    return JSONResponse(content=response_data)

@router.post("/{signal_id}/boost")
async def boost_signal(
    signal_id: str,
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
async def get_signal_stats(
    time_window: str = Query("24h", description="Time window: 1h, 24h, 7d"),
    db: Session = Depends(get_db)
):
    """Get signal statistics"""
    
    # Parse time window
    time_windows = {"1h": 1, "24h": 24, "7d": 168}
    hours = time_windows.get(time_window, 24)
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    
    # Basic stats
    total_signals = db.query(Signal).filter(Signal.created_at >= cutoff_time).count()
    active_signals = db.query(Signal).filter(
        and_(
            Signal.created_at >= cutoff_time,
            Signal.is_flagged == False
        )
    ).count()
    
    # Signal type breakdown
    type_stats = db.query(
        Signal.signal_type,
        func.count(Signal.id).label('count')
    ).filter(
        Signal.created_at >= cutoff_time
    ).group_by(Signal.signal_type).all()
    
    # Brand breakdown
    brand_stats = db.query(
        Signal.brand,
        func.count(Signal.id).label('count')
    ).filter(
        and_(
            Signal.created_at >= cutoff_time,
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