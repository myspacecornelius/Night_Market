"""
Night Market Celery Tasks
Background task processing for the Dharma application
"""

from celery import Celery, Task
from celery.utils.log import get_task_logger
import redis
import json
import time
import httpx
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import asyncio
import os

# Initialize Celery
app = Celery('dharma')
# Package-qualified so it resolves wherever the repository root is on the path
# (the API process imports this module too, without worker/ on its path).
app.config_from_object('worker.celeryconfig')

# Get logger
logger = get_task_logger(__name__)

# Redis client for direct access
redis_client = redis.StrictRedis.from_url(
    os.getenv('REDIS_URL', 'redis://redis:6379/0'),
    decode_responses=True
)

class CallbackTask(Task):
    """Task with callbacks for success/failure"""
    
    def on_success(self, retval, task_id, args, kwargs):
        """Called on successful task completion"""
        logger.info(f"Task {task_id} completed successfully")
        
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Called on task failure"""
        logger.error(f"Task {task_id} failed: {exc}")
        # Send alert
        redis_client.publish(
            "system_alerts",
            json.dumps({
                "type": "alert",
                "payload": {
                    "message": f"Task {task_id} failed: {str(exc)}",
                    "severity": "error",
                    "task_id": task_id
                }
            })
        )

@app.task(base=CallbackTask, bind=True, max_retries=3)
def process_checkout_batch(self, batch_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process a batch of checkout tasks
    """
    try:
        task_count = batch_data.get('count', 0)
        profile_id = batch_data.get('profile_id')
        mode = batch_data.get('mode', 'request')
        retailer = batch_data.get('retailer', 'shopify')
        
        logger.info(f"Processing checkout batch: {task_count} tasks")
        
        # Create individual tasks
        task_ids = []
        for i in range(task_count):
            task_data = {
                'task_id': f"{self.request.id}-{i}",
                'profile_id': profile_id,
                'mode': mode,
                'retailer': retailer,
                'created_at': datetime.now().isoformat()
            }
            
            # Queue for checkout service
            redis_client.lpush("checkout_queue", json.dumps(task_data))
            task_ids.append(task_data['task_id'])
            
        return {
            'success': True,
            'task_ids': task_ids,
            'batch_id': self.request.id
        }
        
    except Exception as e:
        logger.error(f"Batch processing failed: {e}")
        self.retry(exc=e, countdown=60)

@app.task(bind=True)
def warm_account(self, account_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Warm up an account with browsing activity
    """
    try:
        account_id = account_data.get('account_id')
        retailer = account_data.get('retailer', 'shopify')
        duration_minutes = account_data.get('duration', 30)
        
        logger.info(f"Starting account warming for {account_id}")
        
        # Simulate browsing activity
        activities = [
            "Browsing homepage",
            "Viewing product categories",
            "Adding items to wishlist",
            "Reading product reviews",
            "Checking size guide"
        ]
        
        start_time = time.time()
        activity_count = 0
        
        while (time.time() - start_time) < (duration_minutes * 60):
            activity = activities[activity_count % len(activities)]
            
            # Log activity
            redis_client.hset(
                f"warming:{account_id}",
                mapping={
                    'current_activity': activity,
                    'activity_count': activity_count,
                    'last_update': datetime.now().isoformat()
                }
            )
            
            # Simulate activity duration
            time.sleep(30 + (activity_count % 60))
            activity_count += 1
            
        return {
            'success': True,
            'account_id': account_id,
            'activities_performed': activity_count,
            'duration_minutes': duration_minutes
        }
        
    except Exception as e:
        logger.error(f"Account warming failed: {e}")
        raise

@app.task
def rotate_proxies() -> Dict[str, Any]:
    """
    Rotate proxy pool and check health
    """
    try:
        logger.info("Starting proxy rotation check")
        
        # Get active proxies
        active_proxies = redis_client.smembers("proxies:active")
        
        healthy = 0
        burned = 0
        
        # Check each proxy
        for proxy_url in active_proxies:
            proxy_key = f"proxy:{proxy_url}"
            proxy_data = redis_client.hgetall(proxy_key)
            
            # Check failure rate
            failures = int(proxy_data.get('failures', 0))
            requests = int(proxy_data.get('requests', 1))
            failure_rate = failures / requests if requests > 0 else 0
            
            if failure_rate > 0.3:  # 30% failure threshold
                # Mark as burned
                redis_client.srem("proxies:active", proxy_url)
                redis_client.sadd("proxies:burned", proxy_url)
                burned += 1
                logger.warning(f"Proxy {proxy_url} burned - {failure_rate:.1%} failure rate")
            else:
                healthy += 1
                
        # Get new proxies if needed
        if healthy < 10:
            # This would trigger proxy provider API
            logger.info(f"Low proxy count ({healthy}), requesting new proxies")
            
        return {
            'healthy': healthy,
            'burned': burned,
            'total_active': len(active_proxies),
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Proxy rotation failed: {e}")
        raise

@app.task
def analyze_checkout_performance() -> Dict[str, Any]:
    """
    Analyze checkout performance metrics
    """
    try:
        # Get metrics from Redis
        total_checkouts = int(redis_client.get("metrics:total_checkouts") or 0)
        successful_checkouts = int(redis_client.get("metrics:successful_checkouts") or 0)
        
        # Calculate success rate
        success_rate = (successful_checkouts / total_checkouts * 100) if total_checkouts > 0 else 0
        
        # Get retailer-specific metrics
        retailers = ['shopify', 'footsites', 'supreme', 'snkrs']
        retailer_stats = {}
        
        for retailer in retailers:
            retailer_total = int(redis_client.get(f"metrics:{retailer}:total") or 0)
            retailer_success = int(redis_client.get(f"metrics:{retailer}:success") or 0)
            
            retailer_stats[retailer] = {
                'total': retailer_total,
                'success': retailer_success,
                'rate': (retailer_success / retailer_total * 100) if retailer_total > 0 else 0
            }
        
        # Store analysis
        analysis = {
            'overall_success_rate': round(success_rate, 2),
            'total_checkouts': total_checkouts,
            'successful_checkouts': successful_checkouts,
            'retailer_stats': retailer_stats,
            'analyzed_at': datetime.now().isoformat()
        }
        
        redis_client.set("metrics:latest_analysis", json.dumps(analysis))
        
        # Alert if performance drops
        if success_rate < 50 and total_checkouts > 100:
            redis_client.publish(
                "system_alerts",
                json.dumps({
                    "type": "alert",
                    "payload": {
                        "message": f"⚠️ Low success rate: {success_rate:.1f}%",
                        "severity": "warning",
                        "data": analysis
                    }
                })
            )
        
        return analysis
        
    except Exception as e:
        logger.error(f"Performance analysis failed: {e}")
        raise

@app.task
def cleanup_old_data() -> Dict[str, Any]:
    """
    Clean up old data from Redis
    """
    try:
        logger.info("Starting data cleanup")
        
        # Clean up old monitors
        monitors_cleaned = 0
        all_monitors = redis_client.smembers("active_monitors")
        
        for monitor_id in all_monitors:
            monitor_data = redis_client.hgetall(f"monitor:{monitor_id}")
            if monitor_data.get('status') == 'stopped':
                created_at = monitor_data.get('created_at', '')
                if created_at:
                    created_time = datetime.fromisoformat(created_at)
                    if datetime.now() - created_time > timedelta(days=7):
                        redis_client.delete(f"monitor:{monitor_id}")
                        redis_client.srem("active_monitors", monitor_id)
                        monitors_cleaned += 1
        
        # Clean up old tasks
        tasks_cleaned = 0
        # Implementation would scan and clean old task data
        
        # Clean up old alerts
        alerts = redis_client.lrange("stock_alerts", 0, -1)
        alerts_to_keep = []
        
        for alert_json in alerts:
            alert = json.loads(alert_json)
            alert_time = datetime.fromisoformat(alert['timestamp'])
            if datetime.now() - alert_time <= timedelta(days=1):
                alerts_to_keep.append(alert_json)
                
        # Replace list with filtered alerts
        redis_client.delete("stock_alerts")
        for alert in alerts_to_keep:
            redis_client.rpush("stock_alerts", alert)
            
        alerts_cleaned = len(alerts) - len(alerts_to_keep)
        
        return {
            'monitors_cleaned': monitors_cleaned,
            'tasks_cleaned': tasks_cleaned,
            'alerts_cleaned': alerts_cleaned,
            'cleaned_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        raise

# New Dharma tasks
@app.task(bind=True)
def refresh_heatmap_cache(self, zones: Optional[list] = None) -> Dict[str, Any]:
    """
    Refresh heatmap cache tiles for posts + signals endpoints.
    Can target specific geohash zones (best-effort) or refresh globally.
    """
    try:
        logger.info("Starting heatmap cache refresh")
        
        # Clear existing cache namespaces (posts + signals heatmaps)
        cache_keys_cleared = 0
        base_patterns = ["heatmap", "signals:heatmap"]

        key_patterns = []
        if zones:
            for zone in zones:
                for base in base_patterns:
                    key_patterns.append(f"{base}:*{zone}*")
        else:
            key_patterns = [f"{base}:*" for base in base_patterns]

        for pattern in key_patterns:
            keys = list(redis_client.scan_iter(pattern))  # SCAN: KEYS blocks Redis on a large keyspace
            if keys:
                redis_client.delete(*keys)
                cache_keys_cleared += len(keys)
        
        # Pre-warm cache for common zoom levels and time windows
        api_url = os.getenv("API_BASE_URL", "http://api:8000")
        zoom_levels = [6, 7, 8]
        time_windows = ["1h", "24h", "7d"]
        
        warmed_tiles = 0
        
        with httpx.Client(timeout=30) as client:
            for zoom in zoom_levels:
                for window in time_windows:
                    try:
                        response = client.get(
                            f"{api_url}/v1/heatmap",
                            params={"zoom": zoom, "window": window}
                        )
                        if response.status_code == 200:
                            warmed_tiles += 1
                            logger.info(f"Warmed heatmap tile zoom={zoom} window={window}")
                    except Exception as e:
                        logger.warning(f"Failed to warm tile zoom={zoom} window={window}: {e}")
        
        return {
            'success': True,
            'cache_keys_cleared': cache_keys_cleared,
            'tiles_warmed': warmed_tiles,
            'zones_targeted': zones or 'all',
            'refreshed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Heatmap refresh failed: {e}")
        self.retry(exc=e, countdown=60, max_retries=3)

@app.task
def process_new_post(post_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process new post creation and invalidate relevant cache
    """
    try:
        post_location = post_data.get('location', {})
        lat = post_location.get('lat')
        lng = post_location.get('lng')
        
        if lat and lng:
            # Calculate affected geohash zones for cache invalidation
            import geohash2
            affected_zones = []
            
            # Get geohashes at different precisions
            for precision in [6, 7, 8]:
                zone = geohash2.encode(lat, lng, precision)
                affected_zones.append(zone)
            
            # Trigger targeted cache refresh
            refresh_heatmap_cache.delay(zones=affected_zones)
            
            logger.info(f"Triggered heatmap refresh for zones: {affected_zones}")
        
        return {
            'post_id': post_data.get('post_id'),
            'zones_invalidated': affected_zones if lat and lng else [],
            'processed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Post processing failed: {e}")
        raise

@app.task
def daily_laces_stipend() -> Dict[str, Any]:
    """
    Distribute the daily LACES stipend to active users who haven't claimed it
    """
    from services.core import laces
    from services.database import session_scope

    try:
        with session_scope() as db:
            stipends_distributed = laces.distribute_daily_stipends(db)

        logger.info(f"Distributed daily stipend to {stipends_distributed} users")
        return {
            'stipends_distributed': stipends_distributed,
            'amount_per_user': laces.DAILY_STIPEND,
            'total_distributed': stipends_distributed * laces.DAILY_STIPEND,
            'distributed_at': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Daily stipend failed: {e}")
        raise

@app.task
def manage_dropzone_windows() -> Dict[str, Any]:
    """
    Open scheduled dropzones whose start time has passed and end those past their end time
    """
    from services.core.dropzones import sync_dropzone_statuses
    from services.database import session_scope

    try:
        with session_scope() as db:
            result = sync_dropzone_statuses(db)

        if result['zones_opened'] or result['zones_closed']:
            logger.info(f"Dropzones opened: {result['zones_opened']}, closed: {result['zones_closed']}")
        return {**result, 'managed_at': datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Dropzone management failed: {e}")
        raise

@app.task
def cleanup_expired_sessions() -> Dict[str, Any]:
    """
    Revoke login sessions whose refresh token has expired
    """
    from services.core.auth import cleanup_expired_sessions as revoke_expired
    from services.database import session_scope

    try:
        with session_scope() as db:
            revoked = revoke_expired(db)
        return {'sessions_revoked': revoked, 'cleaned_at': datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Session cleanup failed: {e}")
        raise

@app.task(base=CallbackTask, bind=True)
def process_checkout_results(self):
    """
    Process checkout results from the queue and save them to the database.
    """
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from services.models.checkout import CheckoutTaskResult

        database_url = os.getenv("DATABASE_URL")
        engine = create_engine(database_url)
        Session = sessionmaker(bind=engine)

        with Session() as db:
            while True:
                result_json = redis_client.rpop("checkout_results_queue")
                if not result_json:
                    break # Queue is empty

                result_data = json.loads(result_json)

                # Create a new CheckoutTaskResult object
                new_result = CheckoutTaskResult(
                    task_id=result_data['task_id'],
                    user_id=result_data['user_id'],
                    success=result_data['success'],
                    order_id=result_data.get('order_id'),
                    error=result_data.get('error'),
                    product_url=result_data['product_url'],
                    variant_id=result_data.get('variant_id'),
                    size=result_data.get('size'),
                    retailer=result_data['retailer']
                )
                db.add(new_result)

            db.commit()

    except Exception as e:
        logger.error(f"Checkout result processing failed: {e}")
        self.retry(exc=e, countdown=10)

# Periodic tasks are scheduled in worker/celeryconfig.py (beat_schedule).

# WebSocket task for real-time updates
@app.task
def broadcast_update(channel: str, message: Dict[str, Any]) -> None:
    """
    Broadcast update to WebSocket clients
    """
    try:
        redis_client.publish(channel, json.dumps(message))
    except Exception as e:
        logger.error(f"Broadcast failed: {e}")

if __name__ == '__main__':
    app.start()
