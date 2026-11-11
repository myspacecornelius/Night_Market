
import redis
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Without timeouts, a Redis that stops answering without closing the connection
# (a paused container, a network partition) makes every caller wait forever.
REDIS_TIMEOUT_SECONDS = float(os.getenv("REDIS_TIMEOUT_SECONDS", "1"))

r = redis.from_url(
    REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=REDIS_TIMEOUT_SECONDS,
    socket_timeout=REDIS_TIMEOUT_SECONDS,
    health_check_interval=30,
)

def get_redis() -> redis.Redis:
    """Dependency for getting Redis client"""
    return r

