from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, Awaitable, Callable, Dict, Optional

import redis

logger = logging.getLogger(__name__)


class CacheStrategy:
    """
    Centralized Redis caching helper that enforces TTL tiers and prevents stampedes.

    Use `await cache.get_or_set("key", loader=async_callable)` to populate structured data.
    """

    TIERS: Dict[str, int] = {
        "hot": 60,  # 1 minute – highly volatile
        "warm": 300,  # 5 minutes – default tier
        "cold": 3600,  # 1 hour – analytics
        "frozen": 86400,  # 24 hours – static data
    }

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def get_or_set(
        self,
        key: str,
        *,
        loader: Callable[[], Awaitable[Dict[str, Any]]],
        tier: str = "warm",
        ttl: Optional[int] = None,
        lock_expiration: int = 10,
    ) -> Dict[str, Any]:
        """
        Retrieve cached JSON payload or compute & cache it with stampede prevention.

        Args:
            key: Redis key
            loader: async callable returning serializable data
            tier: TTL tier name defined in `TIERS`
            ttl: explicit TTL override
            lock_expiration: seconds before the distributed lock auto-expires
        """

        cached = self.redis.get(key)
        if cached:
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                logger.warning("Malformed cache value for %s, regenerating", key)

        ttl_seconds = ttl or self.TIERS.get(tier, self.TIERS["warm"])
        lock_key = f"lock:{key}"
        token = str(uuid.uuid4())

        if self.redis.set(lock_key, token, nx=True, ex=lock_expiration):
            try:
                payload = await loader()
                self.redis.setex(key, ttl_seconds, json.dumps(payload, default=str))
                return payload
            finally:
                # Release lock if still owned
                if self.redis.get(lock_key) == token:
                    self.redis.delete(lock_key)
        else:
            # Wait for lock holder to finish, but do not block forever
            deadline = time.monotonic() + lock_expiration
            while time.monotonic() < deadline:
                await asyncio.sleep(0.2)
                cached = self.redis.get(key)
                if cached:
                    return json.loads(cached)

        # Lock holder failed to populate within window – compute without caching
        return await loader()

