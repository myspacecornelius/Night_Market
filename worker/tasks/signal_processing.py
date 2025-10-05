"""
Celery tasks for signal processing, deduplication, and aggregation
"""
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from celery import Task
from sqlalchemy import and_, func, text
from sqlalchemy.orm import Session

# Import the main celery app from worker.tasks
try:
    from worker.tasks import app
    from services.database import SessionLocal
    from services.models.signal import Signal
    from services.core.geohash_utils import SignalAggregator, GeohashUtils
    from services.core.redis_client import get_redis
except ImportError:
    # Handle import issues during development
    pass

class DatabaseTask(Task):
    """Base task class that provides database session"""
    _db = None
    
    @property
    def db(self):
        if self._db is None:
            self._db = SessionLocal()
        return self._db
    
    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        if self._db:
            self._db.close()

@app.task(bind=True, base=DatabaseTask)
def deduplicate_signals(self, time_window_hours: int = 1, batch_size: int = 1000):
    """
    Deduplicate signals based on user, location, type, and content
    
    Args:
        time_window_hours: Time window for deduplication
        batch_size: Number of signals to process in each batch
    """
    try:
        redis_client = get_redis()
        
        # Calculate time window
        cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)
        
        # Find signals without dedupe_hash or created recently
        signals_query = self.db.query(Signal).filter(
            and_(
                Signal.created_at >= cutoff_time,
                Signal.dedupe_hash.is_(None)
            )
        ).limit(batch_size)
        
        signals = signals_query.all()
        
        if not signals:
            return {"processed": 0, "duplicates_found": 0}
        
        processed = 0
        duplicates_found = 0
        
        for signal in signals:
            # Generate dedupe hash
            signal.generate_dedupe_hash_for_instance()
            
            # Check for existing signals with same hash in time window
            existing = self.db.query(Signal).filter(
                and_(
                    Signal.dedupe_hash == signal.dedupe_hash,
                    Signal.created_at >= cutoff_time,
                    Signal.id != signal.id
                )
            ).first()
            
            if existing:
                # Mark as duplicate and reduce reputation
                signal.is_flagged = True
                signal.reputation_score -= 10
                duplicates_found += 1
                
                # Log deduplication
                redis_client.incr("signals:duplicates:total")
                redis_client.incr(f"signals:duplicates:user:{signal.user_id}")
            
            processed += 1
        
        self.db.commit()
        
        # Cache deduplication stats
        stats = {
            "processed": processed,
            "duplicates_found": duplicates_found,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        redis_client.setex(
            "signals:dedupe:last_run",
            3600,  # 1 hour cache
            json.dumps(stats)
        )
        
        return stats
        
    except Exception as e:
        self.db.rollback()
        self.retry(countdown=60, max_retries=3, exc=e)

@app.task(bind=True, base=DatabaseTask)
def aggregate_signals_for_heatmap(self, precision: int = 7, time_window_hours: int = 24):
    """
    Aggregate signals by geohash for heatmap generation
    
    Args:
        precision: Geohash precision level
        time_window_hours: Time window for aggregation
    """
    try:
        redis_client = get_redis()
        
        # Calculate time window
        cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)
        
        # Query active signals in time window
        signals = self.db.query(Signal).filter(
            and_(
                Signal.created_at >= cutoff_time,
                Signal.is_flagged == False,
                Signal.visibility.in_(['public', 'local'])
            )
        ).all()
        
        # Convert to dictionaries for aggregation
        signal_dicts = []
        for signal in signals:
            # Get coordinates from PostGIS geometry
            coords = self.db.execute(
                text("SELECT ST_X(:geom) as lng, ST_Y(:geom) as lat"),
                {"geom": signal.geom}
            ).fetchone()
            
            signal_dict = {
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
            }
            signal_dicts.append(signal_dict)
        
        # Aggregate signals by geohash
        aggregated = SignalAggregator.aggregate_by_geohash(
            signal_dicts, 
            precision=precision,
            time_window_hours=time_window_hours
        )
        
        # Cache aggregated data with different TTLs based on precision
        cache_ttl = {
            5: 1800,   # 30 minutes for city level
            6: 900,    # 15 minutes for district level  
            7: 300,    # 5 minutes for neighborhood level
            8: 180,    # 3 minutes for block level
        }.get(precision, 300)
        
        cache_key = f"signals:heatmap:{precision}:{time_window_hours}h"
        
        redis_client.setex(
            cache_key,
            cache_ttl,
            json.dumps(aggregated, default=str)
        )
        
        # Also cache by major cities for quick city-based queries
        city_aggregates = {}
        for bucket in aggregated.values():
            # Determine city from coordinates (simplified)
            lat, lng = bucket['lat'], bucket['lng']
            city = get_city_from_coordinates(lat, lng)
            
            if city:
                if city not in city_aggregates:
                    city_aggregates[city] = []
                city_aggregates[city].append(bucket)
        
        # Cache city-specific aggregates
        for city, buckets in city_aggregates.items():
            city_cache_key = f"signals:heatmap:city:{city}:{precision}:{time_window_hours}h"
            redis_client.setex(
                city_cache_key,
                cache_ttl,
                json.dumps(buckets, default=str)
            )
        
        return {
            "total_signals": len(signal_dicts),
            "geohash_buckets": len(aggregated),
            "precision": precision,
            "time_window_hours": time_window_hours,
            "cached_cities": list(city_aggregates.keys())
        }
        
    except Exception as e:
        self.retry(countdown=60, max_retries=3, exc=e)

@app.task(bind=True, base=DatabaseTask)
def detect_spam_signals(self, time_window_hours: int = 1):
    """
    Detect potential spam signals using heuristics
    
    Args:
        time_window_hours: Time window for spam detection
    """
    try:
        redis_client = get_redis()
        cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)
        
        spam_detected = 0
        
        # Heuristic 1: Too many signals from same user in short time
        user_signal_counts = self.db.query(
            Signal.user_id,
            func.count(Signal.id).label('signal_count')
        ).filter(
            Signal.created_at >= cutoff_time
        ).group_by(Signal.user_id).having(
            func.count(Signal.id) > 10  # More than 10 signals per hour
        ).all()
        
        for user_id, count in user_signal_counts:
            # Flag recent signals from this user
            spam_signals = self.db.query(Signal).filter(
                and_(
                    Signal.user_id == user_id,
                    Signal.created_at >= cutoff_time,
                    Signal.is_flagged == False
                )
            ).all()
            
            for signal in spam_signals[5:]:  # Keep first 5, flag the rest
                signal.is_flagged = True
                signal.reputation_score -= 20
                spam_detected += 1
        
        # Heuristic 2: Identical content from different users (copy-paste spam)
        duplicate_content = self.db.query(
            Signal.text_content,
            func.count(Signal.id).label('count')
        ).filter(
            and_(
                Signal.created_at >= cutoff_time,
                Signal.text_content.isnot(None),
                func.length(Signal.text_content) > 20  # Ignore very short content
            )
        ).group_by(Signal.text_content).having(
            func.count(Signal.id) > 3  # Same content posted 3+ times
        ).all()
        
        for content, count in duplicate_content:
            spam_signals = self.db.query(Signal).filter(
                and_(
                    Signal.text_content == content,
                    Signal.created_at >= cutoff_time,
                    Signal.is_flagged == False
                )
            ).offset(1).all()  # Keep first occurrence, flag others
            
            for signal in spam_signals:
                signal.is_flagged = True
                signal.reputation_score -= 15
                spam_detected += 1
        
        # Heuristic 3: Signals with suspicious patterns (all caps, excessive punctuation)
        suspicious_signals = self.db.query(Signal).filter(
            and_(
                Signal.created_at >= cutoff_time,
                Signal.text_content.isnot(None),
                Signal.is_flagged == False
            )
        ).all()
        
        for signal in suspicious_signals:
            text = signal.text_content or ""
            
            # Check for spam patterns
            is_suspicious = False
            
            if len(text) > 10:
                caps_ratio = sum(1 for c in text if c.isupper()) / len(text)
                if caps_ratio > 0.7:  # More than 70% caps
                    is_suspicious = True
                
                punct_ratio = sum(1 for c in text if c in "!?.,;:") / len(text)
                if punct_ratio > 0.3:  # More than 30% punctuation
                    is_suspicious = True
            
            if is_suspicious:
                signal.reputation_score -= 5
                # Don't auto-flag, just reduce reputation
        
        self.db.commit()
        
        # Cache spam detection stats
        stats = {
            "spam_detected": spam_detected,
            "timestamp": datetime.utcnow().isoformat(),
            "velocity_violations": len(user_signal_counts),
            "duplicate_content": len(duplicate_content)
        }
        
        redis_client.setex(
            "signals:spam:last_run",
            3600,
            json.dumps(stats)
        )
        
        return stats
        
    except Exception as e:
        self.db.rollback()
        self.retry(countdown=60, max_retries=3, exc=e)

@app.task(bind=True)
def refresh_heatmap_cache(self, precision_levels: List[int] = None, time_windows: List[int] = None):
    """
    Refresh heatmap cache for multiple precision levels and time windows
    
    Args:
        precision_levels: List of geohash precision levels to refresh
        time_windows: List of time windows in hours to refresh
    """
    if precision_levels is None:
        precision_levels = [5, 6, 7, 8]
    
    if time_windows is None:
        time_windows = [1, 24, 168]  # 1 hour, 1 day, 1 week
    
    results = []
    
    for precision in precision_levels:
        for time_window in time_windows:
            try:
                result = aggregate_signals_for_heatmap.delay(precision, time_window)
                results.append({
                    "precision": precision,
                    "time_window": time_window,
                    "task_id": result.id
                })
            except Exception as e:
                results.append({
                    "precision": precision,
                    "time_window": time_window,
                    "error": str(e)
                })
    
    return {"refreshed_caches": results}

def get_city_from_coordinates(lat: float, lng: float) -> Optional[str]:
    """
    Simple city detection from coordinates
    In production, this would use a reverse geocoding service
    """
    # Simplified city boundaries (for demo purposes)
    cities = {
        "Boston": {"lat_range": (42.2, 42.5), "lng_range": (-71.3, -70.8)},
        "NYC": {"lat_range": (40.4, 40.9), "lng_range": (-74.3, -73.7)},
        "LA": {"lat_range": (33.7, 34.3), "lng_range": (-118.7, -117.9)},
        "Chicago": {"lat_range": (41.6, 42.1), "lng_range": (-88.0, -87.3)},
    }
    
    for city, bounds in cities.items():
        lat_min, lat_max = bounds["lat_range"]
        lng_min, lng_max = bounds["lng_range"]
        
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return city
    
    return None

# Schedule periodic tasks (these would be added to celerybeat-schedule)
@app.task
def periodic_signal_maintenance():
    """Run periodic signal maintenance tasks"""
    # Run deduplication every 15 minutes
    deduplicate_signals.delay(time_window_hours=1)
    
    # Run spam detection every 30 minutes
    detect_spam_signals.delay(time_window_hours=2)
    
    # Refresh heatmap cache every 5 minutes
    refresh_heatmap_cache.delay(
        precision_levels=[6, 7],
        time_windows=[1, 24]
    )