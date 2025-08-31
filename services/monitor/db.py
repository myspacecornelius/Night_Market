"""Asynchronous MySQL storage helper.

This module provides a minimal wrapper around aiomysql that compresses and
deduplicates data before persisting it.  Each payload is gzipped and stored
alongside a SHA256 hash which acts as a natural unique key.  Attempting to
insert an existing hash simply updates the ``last_seen`` timestamp, keeping the
table compact while preserving query speed through indexing on the hash column.
"""

from __future__ import annotations

import json
import zlib
import hashlib
from typing import Any, Dict

import aiomysql


class StockDatabase:
    """Light‑weight asynchronous client for the stock alert store."""

    def __init__(self, dsn: Dict[str, Any]):
        self._dsn = dsn
        self._pool: aiomysql.Pool | None = None

    async def connect(self) -> None:
        """Open a connection pool."""
        if self._pool is None:
            self._pool = await aiomysql.create_pool(autocommit=True, **self._dsn)

    async def close(self) -> None:
        """Close the connection pool."""
        if self._pool is not None:
            self._pool.close()
            await self._pool.wait_closed()
            self._pool = None

    @staticmethod
    def _compress(data: Dict[str, Any]) -> bytes:
        """Serialize and compress a dictionary."""
        raw = json.dumps(data, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return zlib.compress(raw)

    async def store_alert(self, alert: Dict[str, Any]) -> None:
        """Persist an alert payload with deduplication."""
        if self._pool is None:
            return

        compressed = self._compress(alert)
        digest = hashlib.sha256(compressed).hexdigest()

        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS stock_alerts (
                        hash CHAR(64) PRIMARY KEY,
                        data LONGBLOB NOT NULL,
                        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB
                    """
                )
                await cur.execute(
                    """
                    INSERT INTO stock_alerts (hash, data)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE last_seen = NOW()
                    """,
                    (digest, compressed),
                )

