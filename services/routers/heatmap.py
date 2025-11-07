from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import geohash2
import redis
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from services.core.cache import CacheStrategy
from services.core.redis_client import get_redis
from services.database import get_db
from services.models.location import Location
from services.models.post import Post

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
    now = datetime.utcnow()
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
    redis_client: redis.Redis = Depends(get_redis),
):
    """
    Get heatmap data aggregated by geohash with time and bbox filtering
    Uses CacheStrategy to keep hot responses in Redis with lock protection.
    """
    if zoom < 4 or zoom > 10:
        raise HTTPException(status_code=400, detail="Zoom level must be between 4 and 10")

    parsed_bbox = parse_bbox(bbox) if bbox else None
    if bbox and not parsed_bbox:
        raise HTTPException(status_code=400, detail="Invalid bbox format")

    tier = {"1h": "hot", "24h": "warm", "7d": "cold"}.get(window, "warm")
    cache_key = f"heatmap:{zoom}:{window}:{bbox or 'global'}"
    cache = CacheStrategy(redis_client)

    async def _build_payload() -> Dict[str, Any]:
        window_start = get_time_window_start(window)
        query = (
            db.query(
                Post,
                func.ST_Y(Location.point).label("lat"),
                func.ST_X(Location.point).label("lng"),
            )
            .join(Location)
            .filter(Post.timestamp >= window_start)
        )

        if parsed_bbox:
            min_lng, min_lat, max_lng, max_lat = parsed_bbox
            bbox_geom = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
            query = query.filter(func.ST_Intersects(Location.point, bbox_geom))

        records = query.all()
        geohash_bins: Dict[str, Dict[str, Any]] = {}

        for post, lat, lng in records:
            post_geohash = geohash2.encode(lat, lng, precision=zoom)

            if post_geohash not in geohash_bins:
                geohash_center = geohash2.decode(post_geohash)
                geohash_bins[post_geohash] = {
                    "geohash": post_geohash,
                    "lat": geohash_center[0],
                    "lng": geohash_center[1],
                    "post_count": 0,
                    "boost_score": 0,
                    "tags": [],
                    "posts": [],
                }

            bin_data = geohash_bins[post_geohash]
            bin_data["post_count"] += 1
            bin_data["boost_score"] += post.boost_score or 0

            if post.tags:
                bin_data["tags"].extend(post.tags)

            if len(bin_data["posts"]) < 3:
                bin_data["posts"].append(
                    {
                        "post_id": str(post.post_id),
                        "content_text": post.content_text[:100] if post.content_text else None,
                        "media_url": post.media_url,
                        "timestamp": post.timestamp.isoformat(),
                        "boost_score": post.boost_score or 0,
                    }
                )

        bins: List[Dict[str, Any]] = []
        for bin_data in geohash_bins.values():
            tag_counts: Dict[str, int] = {}
            for tag in bin_data["tags"]:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
            top_tags = sorted(tag_counts.keys(), key=lambda x: tag_counts[x], reverse=True)[:3]

            bins.append(
                HeatMapBin(
                    geohash=bin_data["geohash"],
                    lat=bin_data["lat"],
                    lng=bin_data["lng"],
                    post_count=bin_data["post_count"],
                    boost_score=bin_data["boost_score"],
                    top_tags=top_tags,
                    sample_posts=bin_data["posts"],
                ).model_dump()
            )

        response = HeatMapResponse(
            bins=bins,
            total_posts=len(records),
            time_window=window,
            bbox=parsed_bbox,
        )

        return response.model_dump()

    payload = await cache.get_or_set(cache_key, loader=_build_payload, tier=tier)
    return HeatMapResponse(**payload)

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
