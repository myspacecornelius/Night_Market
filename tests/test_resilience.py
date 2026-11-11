"""What the API does when something it depends on stops answering."""
import asyncio
import time

import httpx
import redis
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route


class StalledRedis:
    """A Redis that accepts the request and then says nothing until the socket times out."""

    def __init__(self, stall_seconds=0.6):
        self.stall_seconds = stall_seconds
        self.calls = 0

    def pipeline(self):
        self.calls += 1
        time.sleep(self.stall_seconds)
        raise redis.exceptions.TimeoutError("Timeout reading from socket")


def _app(redis_client):
    from services.middleware.rate_limit import RateLimitMiddleware

    async def ok(request):
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/limited", ok), Route("/health", ok)])
    app.add_middleware(RateLimitMiddleware, redis_client=redis_client)
    return app


def test_a_stalled_redis_does_not_freeze_other_requests():
    """The rate limiter talks to Redis on every request. It did so on the event loop,
    so while one request waited for Redis nothing else was served, health check included."""
    app = _app(StalledRedis())

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            started = time.perf_counter()
            limited = asyncio.create_task(client.get("/limited"))  # will wait for Redis
            health = await client.get("/health")  # exempt from limiting: touches nothing
            health_seconds = time.perf_counter() - started
            return await limited, health, health_seconds

    limited, health, health_seconds = asyncio.run(scenario())

    assert health.status_code == 200
    assert health_seconds < 0.3, f"/health took {health_seconds:.2f}s while another request waited for Redis"
    assert limited.status_code == 200  # the limiter fails open


def test_the_limiter_stops_asking_a_redis_that_just_failed():
    """Failing open after a timeout is not enough if every request pays the timeout."""
    stalled = StalledRedis(stall_seconds=0.05)
    app = _app(stalled)

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return [(await client.get("/limited")).status_code for _ in range(5)]

    assert asyncio.run(scenario()) == [200] * 5
    assert stalled.calls == 1


def test_the_redis_client_gives_up_instead_of_waiting_forever():
    from services.core.redis_client import r

    options = r.connection_pool.connection_kwargs
    assert 0 < options["socket_connect_timeout"] <= 5
    assert 0 < options["socket_timeout"] <= 5
