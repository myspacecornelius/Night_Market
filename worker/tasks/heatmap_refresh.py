from celery import shared_task
import redis
import os


@shared_task(name="tasks.refresh_heatmap_cache")
def refresh_heatmap_cache():
    """
    Clear heatmap cache to force refresh.
    Runs periodically to ensure fresh data.
    """
    redis_url = os.getenv('REDIS_URL', 'redis://redis:6379/0')
    redis_client = redis.from_url(redis_url)

    try:
        # Find all heatmap cache keys and delete them
        pattern = "heatmap:*"
        keys = redis_client.keys(pattern)

        if keys:
            redis_client.delete(*keys)
            cleared_count = len(keys)
        else:
            cleared_count = 0

        return {
            "status": "success",
            "cache_keys_cleared": cleared_count,
            "message": f"Cleared {cleared_count} heatmap cache entries"
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
    finally:
        redis_client.close()
