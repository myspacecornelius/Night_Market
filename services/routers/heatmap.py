from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import json
import geohash2
import redis
from pydantic import BaseModel

from services.database import get_db
from services.core.redis_client import get_redis
from services.models.post import Post
from services.models.location import Location
from sqlalchemy import func, and_, text

router = APIRouter()

class HeatMapResponse(BaseModel):
    bins: List[Dict[str, Any]]
    total_posts: int
    time_window: str
    bbox: Optional[List[float]]

class HeatMapBin(BaseModel):
    geohash: str
    lat: float
    lng: float
    post_count: int
    boost_score: int
    top_tags: List[str]
    sample_posts: List[Dict[str, Any]]

def get_time_window_start(window: str) -> datetime:
    """Convert time window string to datetime start"""
    now = datetime.now(timezone.utc)
    if window == "1h":
        return now - timedelta(hours=1)
    elif window == "24h":
        return now - timedelta(hours=24)
    elif window == "7d":
        return now - timedelta(days=7)
    else:
        return now - timedelta(hours=24)  # default to 24h

def parse_bbox(bbox_str: str) -> Optional[List[float]]:
    """Parse bbox string 'min_lng,min_lat,max_lng,max_lat' to floats"""
    try:
        return [float(x) for x in bbox_str.split(',')]
    except (ValueError, AttributeError):
        return None

@router.get("/heatmap", response_model=HeatMapResponse)
async def get_heatmap(
    bbox: Optional[str] = Query(None, description="Bounding box: min_lng,min_lat,max_lng,max_lat"),
    zoom: Optional[int] = Query(7, description="Geohash precision level (4-10)"),
    window: Optional[str] = Query("24h", description="Time window: 1h, 24h, 7d"),
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    Get heatmap data aggregated by geohash with time and bbox filtering
    Data is cached in Redis with 5-minute TTL for performance
    """
    # Validate inputs
    if zoom < 4 or zoom > 10:
        raise HTTPException(status_code=400, detail="Zoom level must be between 4 and 10")
    
    parsed_bbox = parse_bbox(bbox) if bbox else None
    if bbox and not parsed_bbox:
        raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    # Generate cache key
    cache_key = f"heatmap:{zoom}:{window}:{bbox or 'global'}"
    
    # Try to get cached data
    cached_data = redis_client.get(cache_key)
    if cached_data:
        return HeatMapResponse(**json.loads(cached_data))
    
    # Calculate time window start
    window_start = get_time_window_start(window)
    
    # Build query for posts within time window
    query = db.query(Post).join(Location).filter(
        Post.timestamp >= window_start
    )
    
    # Apply bbox filter if provided
    if parsed_bbox:
        min_lng, min_lat, max_lng, max_lat = parsed_bbox
        # Use PostGIS ST_Intersects with bounding box
        bbox_geom = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
        query = query.filter(func.ST_Intersects(Location.point, bbox_geom))
    
    # Execute query to get posts with locations
    posts_with_locations = query.all()
    
    # Aggregate by geohash
    geohash_bins = {}
    total_posts = len(posts_with_locations)
    
    for post in posts_with_locations:
        # Get location coordinates from PostGIS point
        coords_result = db.execute(
            text("SELECT ST_X(:point) as lng, ST_Y(:point) as lat"),
            {"point": post.location.point}
        ).fetchone()
        
        lat, lng = coords_result.lat, coords_result.lng
        
        # Generate geohash at specified precision
        post_geohash = geohash2.encode(lat, lng, precision=zoom)
        
        if post_geohash not in geohash_bins:
            # Get geohash center coordinates
            geohash_center = geohash2.decode(post_geohash)
            geohash_bins[post_geohash] = {
                "geohash": post_geohash,
                "lat": geohash_center[0],
                "lng": geohash_center[1],
                "post_count": 0,
                "boost_score": 0,
                "tags": [],
                "posts": []
            }
        
        bin_data = geohash_bins[post_geohash]
        bin_data["post_count"] += 1
        bin_data["boost_score"] += post.boost_score or 0
        
        # Collect tags
        if post.tags:
            bin_data["tags"].extend(post.tags)
        
        # Store sample posts (limit to 3 per bin)
        if len(bin_data["posts"]) < 3:
            bin_data["posts"].append({
                "post_id": str(post.post_id),
                "content_text": post.content_text[:100] if post.content_text else None,
                "media_url": post.media_url,
                "timestamp": post.timestamp.isoformat(),
                "boost_score": post.boost_score or 0
            })
    
    # Process bins and get top tags
    bins = []
    for bin_data in geohash_bins.values():
        # Get top 3 most common tags
        tag_counts = {}
        for tag in bin_data["tags"]:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
        top_tags = sorted(tag_counts.keys(), key=lambda x: tag_counts[x], reverse=True)[:3]
        
        bins.append(HeatMapBin(
            geohash=bin_data["geohash"],
            lat=bin_data["lat"],
            lng=bin_data["lng"],
            post_count=bin_data["post_count"],
            boost_score=bin_data["boost_score"],
            top_tags=top_tags,
            sample_posts=bin_data["posts"]
        ))
    
    # Create response
    response = HeatMapResponse(
        bins=[bin.dict() for bin in bins],
        total_posts=total_posts,
        time_window=window,
        bbox=parsed_bbox
    )
    
    # Cache result for 5 minutes
    redis_client.setex(
        cache_key, 
        300,  # 5 minutes in seconds
        json.dumps(response.dict())
    )
    
    return response

@router.post("/heatmap/refresh")
async def refresh_heatmap_cache(
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    Clear heatmap cache to force refresh
    Used by background workers when new posts are created
    """
    # Find all heatmap cache keys and delete them
    pattern = "heatmap:*"
    keys = redis_client.keys(pattern)
    if keys:
        redis_client.delete(*keys)
    
    return {"cache_keys_cleared": len(keys)}