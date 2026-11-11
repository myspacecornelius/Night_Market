"""The generation counter behind the cached feed pages.

Feed pages are cached in Redis under keys that include a generation number.
Anything that changes what a feed shows starts a new generation, which makes
every cached page unreachable at once.
"""
import logging
from typing import Optional

import redis

from services.core.redis_client import r

logger = logging.getLogger(__name__)

FEED_VERSION_KEY = "feed_version"


def feed_version() -> Optional[str]:
    """Current cache generation, or None when Redis is unavailable (then nothing is cached)."""
    try:
        return r.get(FEED_VERSION_KEY) or "0"
    except redis.RedisError as error:
        logger.warning("Feed cache unavailable: %s", error)
        return None


def invalidate_feeds() -> None:
    """Start a new cache generation so every cached feed page is ignored from now on."""
    try:
        r.incr(FEED_VERSION_KEY)
    except redis.RedisError as error:
        logger.warning("Could not invalidate feed cache: %s", error)
