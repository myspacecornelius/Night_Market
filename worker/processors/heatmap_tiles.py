"""
Heat map tile generation and management tasks
Optimized tile-based caching for better performance
"""
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from celery import Task
from sqlalchemy import and_, func, text, delete
from sqlalchemy.orm import Session

from worker.tasks import app
from services.database import SessionLocal
from services.models.signal import Signal
from services.models.post import Post
from services.models.location import Location
from services.models.heat_map_tile import HeatMapTile
from services.core.geohash_utils import GeohashUtils
from services.core.redis_client import get_redis


class TileTask(Task):
    """Base task with database session management for tile operations"""
    _db = None
    
    @property
    def db(self):
        if self._db is None:
            self._db = SessionLocal()
        return self._db
    
    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        if self._db:
            self._db.close()


@app.task(bind=True, base=TileTask)
def generate_heatmap_tiles(self, precision: int = 7, time_window: str = "24h", force_refresh: bool = False):
    """
    Generate pre-computed heat map tiles for specified precision and time window
    
    Args:
        precision: Geohash precision level (4-8)
        time_window: Time window ('1h', '24h', '7d')
        force_refresh: Whether to regenerate existing tiles
    """
    try:
        from services.core.geohash_utils import GeohashUtils
        import geohash2
        
        # Calculate time window start
        now = datetime.utcnow()
        window_hours = {"1h": 1, "24h": 24, "7d": 168}.get(time_window, 24)
        cutoff_time = now - timedelta(hours=window_hours)
        expiry_time = now + timedelta(hours=window_hours)  # TTL
        
        # Clear old tiles if force refresh
        if force_refresh:
            self.db.query(HeatMapTile).filter(
                and_(
                    HeatMapTile.precision == precision,
                    HeatMapTile.time_window == time_window
                )
            ).delete()
        
        # Get signals and posts within time window
        signals_query = self.db.query(Signal).filter(
            and_(
                Signal.created_at >= cutoff_time,
                Signal.is_flagged == False,
                Signal.visibility.in_(['public', 'local'])
            )
        )
        
        posts_query = self.db.query(Post).join(Location).filter(
            Post.timestamp >= cutoff_time
        )
        
        signals = signals_query.all()
        posts = posts_query.all()
        
        # Aggregate by geohash
        tile_data = {}
        
        # Process signals
        for signal in signals:
            coords = self.db.execute(
                text("SELECT ST_X(:geom) as lng, ST_Y(:geom) as lat"),
                {"geom": signal.geom}
            ).fetchone()
            
            geohash = geohash2.encode(coords.lat, coords.lng, precision)
            
            if geohash not in tile_data:
                center = geohash2.decode(geohash)
                tile_data[geohash] = {
                    "geohash": geohash,
                    "center_lat": center[0],
                    "center_lng": center[1],
                    "signal_count": 0,
                    "post_count": 0,
                    "total_boost_score": 0,
                    "brands": {},
                    "tags": {},
                    "sample_posts": []
                }
            
            tile = tile_data[geohash]
            tile["signal_count"] += 1
            tile["total_boost_score"] += signal.reputation_score or 0
            
            # Collect brand data
            if signal.brand:
                tile["brands"][signal.brand] = tile["brands"].get(signal.brand, 0) + 1
            
            # Collect tag data
            if signal.tags:
                for tag in signal.tags:
                    tile["tags"][tag] = tile["tags"].get(tag, 0) + 1
        
        # Process posts
        for post in posts:
            coords = self.db.execute(
                text("SELECT ST_X(:point) as lng, ST_Y(:point) as lat"),
                {"point": post.location.point}
            ).fetchone()
            
            geohash = geohash2.encode(coords.lat, coords.lng, precision)
            
            if geohash not in tile_data:
                center = geohash2.decode(geohash)
                tile_data[geohash] = {
                    "geohash": geohash,
                    "center_lat": center[0],
                    "center_lng": center[1],
                    "signal_count": 0,
                    "post_count": 0,
                    "total_boost_score": 0,
                    "brands": {},
                    "tags": {},
                    "sample_posts": []
                }
            
            tile = tile_data[geohash]
            tile["post_count"] += 1
            tile["total_boost_score"] += post.boost_score or 0
            
            # Collect tag data
            if post.tags:
                for tag in post.tags:
                    tile["tags"][tag] = tile["tags"].get(tag, 0) + 1
            
            # Add sample post (limit 3 per tile)
            if len(tile["sample_posts"]) < 3:
                tile["sample_posts"].append({
                    "post_id": str(post.post_id),
                    "content_text": post.content_text[:100] if post.content_text else None,
                    "media_url": post.media_url,
                    "timestamp": post.timestamp.isoformat(),
                    "boost_score": post.boost_score or 0
                })
        
        # Save tiles to database
        tiles_created = 0
        for geohash, data in tile_data.items():
            # Convert brand/tag dicts to sorted lists
            top_brands = sorted(data["brands"].items(), key=lambda x: x[1], reverse=True)[:5]
            top_tags = sorted(data["tags"].items(), key=lambda x: x[1], reverse=True)[:5]
            
            # Check if tile already exists
            existing_tile = self.db.query(HeatMapTile).filter(
                and_(
                    HeatMapTile.geohash == geohash,
                    HeatMapTile.precision == precision,
                    HeatMapTile.time_window == time_window
                )
            ).first()
            
            if existing_tile:
                # Update existing tile
                existing_tile.signal_count = data["signal_count"]
                existing_tile.post_count = data["post_count"]
                existing_tile.total_boost_score = data["total_boost_score"]
                existing_tile.top_brands = [{"brand": brand, "count": count} for brand, count in top_brands]
                existing_tile.top_tags = [tag for tag, count in top_tags]
                existing_tile.sample_posts = data["sample_posts"]
                existing_tile.updated_at = now
                existing_tile.expires_at = expiry_time
            else:
                # Create new tile
                new_tile = HeatMapTile(
                    geohash=geohash,
                    precision=precision,
                    time_window=time_window,
                    signal_count=data["signal_count"],
                    post_count=data["post_count"],
                    total_boost_score=data["total_boost_score"],
                    center_lat=data["center_lat"],
                    center_lng=data["center_lng"],
                    top_brands=[{"brand": brand, "count": count} for brand, count in top_brands],
                    top_tags=[tag for tag, count in top_tags],
                    sample_posts=data["sample_posts"],
                    expires_at=expiry_time
                )
                self.db.add(new_tile)
                tiles_created += 1
        
        self.db.commit()
        
        return {
            "precision": precision,
            "time_window": time_window,
            "tiles_processed": len(tile_data),
            "tiles_created": tiles_created,
            "signals_processed": len(signals),
            "posts_processed": len(posts),
            "generated_at": now.isoformat()
        }
        
    except Exception as e:
        self.db.rollback()
        self.retry(countdown=60, max_retries=3, exc=e)


@app.task(bind=True, base=TileTask)
def cleanup_expired_tiles(self):
    """Remove expired heat map tiles from database"""
    try:
        now = datetime.utcnow()
        
        # Delete expired tiles
        deleted_count = self.db.execute(
            delete(HeatMapTile).where(HeatMapTile.expires_at < now)
        ).rowcount
        
        self.db.commit()
        
        return {
            "expired_tiles_removed": deleted_count,
            "cleanup_time": now.isoformat()
        }
        
    except Exception as e:
        self.db.rollback()
        raise


@app.task
def refresh_all_heatmap_tiles():
    """Refresh tiles for all precision levels and time windows"""
    from celery import group
    
    # Standard precision levels and time windows
    precision_levels = [5, 6, 7, 8]
    time_windows = ["1h", "24h", "7d"]
    
    # Create batch of tile generation tasks
    job = group(
        generate_heatmap_tiles.s(precision, time_window) 
        for precision in precision_levels 
        for time_window in time_windows
    )
    
    result = job.apply_async()
    
    return {
        "batch_id": result.id,
        "tasks_queued": len(precision_levels) * len(time_windows),
        "precision_levels": precision_levels,
        "time_windows": time_windows
    }


@app.task
def optimize_tile_coverage(min_activity_threshold: int = 5):
    """
    Analyze tile usage and optimize coverage
    Remove tiles with minimal activity, focus on active areas
    """
    try:
        db = SessionLocal()
        
        # Find low-activity tiles
        low_activity_tiles = db.query(HeatMapTile).filter(
            HeatMapTile.signal_count + HeatMapTile.post_count < min_activity_threshold
        ).all()
        
        # Remove low-activity tiles older than 1 day
        cutoff = datetime.utcnow() - timedelta(days=1)
        removed_count = 0
        
        for tile in low_activity_tiles:
            if tile.created_at < cutoff:
                db.delete(tile)
                removed_count += 1
        
        db.commit()
        db.close()
        
        return {
            "low_activity_tiles_removed": removed_count,
            "threshold": min_activity_threshold,
            "optimized_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        if db:
            db.rollback()
            db.close()
        raise