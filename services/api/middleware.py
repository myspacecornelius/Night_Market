"""
API Middleware for logging, rate limiting, error handling, and security
"""

from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
import time
import json
import logging
import uuid
from datetime import datetime, timedelta
import redis.asyncio as redis
from typing import Dict, Optional, Callable
import hashlib
import hmac
from functools import wraps
import asyncio
import os
import base64
from prometheus_client import Counter, Gauge
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

# --- Prometheus Metrics ---
RATE_ALLOWED = Counter("snpd_rate_allowed_total", "Requests allowed", ["scope"])
RATE_LIMITED = Counter("snpd_rate_limited_total", "Requests limited", ["scope"])
RATE_DROPPED = Counter("snpd_rate_dropped_total", "Requests dropped (shed)", ["scope"])
RATE_TOKENS  = Gauge("snpd_rate_tokens", "Tokens remaining", ["scope"])
CONCURRENCY  = Gauge("snpd_concurrency_current", "Current in-process concurrency")
QUEUE_DEPTH  = Gauge("snpd_queue_depth", "Waiting requests in admission queue")

CACHE_HIT   = Counter("snpd_cache_hits_total", "Cache hits", ["route"])
CACHE_MISS  = Counter("snpd_cache_miss_total", "Cache misses", ["route"])
CACHE_STALE = Counter("snpd_cache_stale_total", "Stale served", ["route"])
CACHE_FILL  = Gauge("snpd_cache_fill_inflight", "In-flight cache fills", ["route"])

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests with timing and response info"""
    
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        # Start timing
        start_time = time.time()
        
        # Log request
        logger.info(f"Request {request_id}: {request.method} {request.url.path}")
        
        # Add request ID to response headers
        response = await call_next(request)
        
        # Calculate duration
        duration = time.time() - start_time
        
        # Log response
        logger.info(
            f"Response {request_id}: "
            f"status={response.status_code} "
            f"duration={duration:.3f}s"
        )
        
        # Add headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration:.3f}"
        
        return response

class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Global error handling with proper formatting"""
    
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except HTTPException as e:
            return JSONResponse(
                status_code=e.status_code,
                content={
                    "success": False,
                    "error": {
                        "code": f"HTTP_{e.status_code}",
                        "message": e.detail
                    },
                    "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
                    "timestamp": datetime.now().isoformat()
                }
            )
        except Exception as e:
            logger.error(f"Unhandled error: {str(e)}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "An unexpected error occurred"
                    },
                    "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
                    "timestamp": datetime.now().isoformat()
                }
            )

class SecurityMiddleware(BaseHTTPMiddleware):
    """Security headers and request validation"""
    
    async def dispatch(self, request: Request, call_next):
        # Add security headers
        response = await call_next(request)
        
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        
        return response

class WebhookSignatureMiddleware(BaseHTTPMiddleware):
    """Validate webhook signatures for security"""
    
    def __init__(self, app, secret_key: str):
        super().__init__(app)
        self.secret_key = secret_key
    
    async def dispatch(self, request: Request, call_next):
        # Only validate webhook endpoints
        if not request.url.path.startswith("/webhooks/"):
            return await call_next(request)
        
        # Get signature from header
        signature = request.headers.get("X-Webhook-Signature")
        if not signature:
            return JSONResponse(
                status_code=401,
                content={"error": "Missing webhook signature"}
            )
        
        # Read body
        body = await request.body()
        
        # Calculate expected signature
        expected_signature = hmac.new(
            self.secret_key.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        
        # Validate signature
        if not hmac.compare_digest(signature, expected_signature):
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid webhook signature"}
            )
        
        # Continue with valid request
        return await call_next(request)

# Decorator for endpoint-specific caching
def cache_response(ttl: int = 300):
    """Decorator to cache endpoint responses"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get request from args
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            
            if not request:
                return await func(*args, **kwargs)
            
            # Generate cache key
            cache_key = f"endpoint:{func.__name__}:{str(kwargs)}"
            
            # Try to get from cache
            redis_client = request.app.state.redis
            cached = await redis_client.get(cache_key)
            
            if cached:
                return json.loads(cached)
            
            # Get fresh result
            result = await func(*args, **kwargs)
            
            # Cache result
            await redis_client.setex(
                cache_key,
                ttl,
                json.dumps(result.dict() if hasattr(result, 'dict') else result)
            )
            
            return result
        
        return wrapper
    return decorator

# Request ID context manager
class RequestIDContext:
    """Context manager for request ID propagation"""
    
    def __init__(self):
        self._request_id = None
    
    def set(self, request_id: str):
        self._request_id = request_id
    
    def get(self) -> Optional[str]:
        return self._request_id

request_id_context = RequestIDContext()

class EnhancedRateLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        redis: redis.Redis,
        *,
        capacity_global: int = 1000,
        rate_global: int = 1000,
        capacity_user: int = 200,
        rate_user: int = 200,
        capacity_ip: int = 150,
        rate_ip: int = 150,
        capacity_route: int = 300,
        rate_route: int = 300,
        cost: int = 1,
        ttl_seconds: int = 60,
        max_concurrency: int = 200,
        shed_threshold: int = 240,
    ):
        self.app = app
        self.redis = redis
        self.lua_sha = None
        self.lua_path = os.path.join(os.path.dirname(__file__), "rate_limiter.lua")
        self.capacity = {
            "global": (capacity_global, rate_global),
            "route":  (capacity_route,  rate_route),
            "user":   (capacity_user,   rate_user),
            "ip":     (capacity_ip,     rate_ip),
        }
        self.cost = cost
        self.ttl = ttl_seconds
        self.sema = asyncio.Semaphore(max_concurrency)
        self.shed_threshold = shed_threshold

    async def _ensure_lua(self):
        if self.lua_sha is None:
            with open(self.lua_path, "r", encoding="utf-8") as f:
                script = f.read()
            self.lua_sha = await self.redis.script_load(script)

    def _keys(self, scope, route: str, user: Optional[str], ip: str):
        base = "rl"
        return {
            "global": f"{base}:g",
            "route":  f"{base}:r:{route}",
            "user":   f"{base}:u:{user or 'anon'}",
            "ip":     f"{base}:i:{ip}",
        }

    async def _check_bucket(self, key: str, cap: int, rate: int) -> tuple[int, float, int]:
        await self._ensure_lua()
        now_ms = int(time.time() * 1000)
        res = await self.redis.evalsha(
            self.lua_sha, 1, key, cap, rate, now_ms, self.cost, self.ttl
        )
        allowed, tokens, retry_after_ms = int(res[0]), float(res[1]), int(res[2])
        return allowed, tokens, retry_after_ms

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        # Admission control (fast path: shed if queue too deep)
        queued = max(0, self.sema._value * -1)
        QUEUE_DEPTH.set(queued)
        if CONCURRENCY._value is not None and CONCURRENCY._value >= self.shed_threshold:
            RATE_DROPPED.labels(scope="admission").inc()
            return await self._reject(send, 429, "admission_shed", retry_after=0.2)

        route = scope.get("path", "/")
        ip = scope.get("client")[0] if scope.get("client") else "0.0.0.0"
        user = None
        # Optional: pull user from auth header or request state later.

        keys = self._keys(scope, route, user, ip)

        # Hierarchical checks: global → route → user → IP (fail fast)
        for level in ("global", "route", "user", "ip"):
            cap, rate = self.capacity[level]
            allowed, tokens, retry_ms = await self._check_bucket(keys[level], cap, rate)
            RATE_TOKENS.labels(scope=level).set(tokens)
            if not allowed:
                RATE_LIMITED.labels(scope=level).inc()
                return await self._reject(send, 429, f"rate_limited_{level}", retry_after=retry_ms/1000.0)

        # Passed limiter: run request inside concurrency semaphore
        async with self.sema:
            CONCURRENCY.inc()
            try:
                RATE_ALLOWED.labels(scope="ok").inc()
                await self.app(scope, receive, send)
            finally:
                CONCURRENCY.dec()

    async def _reject(self, send: Send, status: int, reason: str, *, retry_after: float = None):
        headers = [(b"content-type", b"application/json")]
        if retry_after:
            headers.append((b"retry-after", str(retry_after).encode()))
        body = ('{"success":false,"error":"' + reason + '"}').encode()
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})

class EnhancedCacheMiddleware:
    def __init__(self, app: ASGIApp, redis: redis.Redis, *, secret: str, default_ttl: int = 60, swr_ttl: int = 300):
        self.app = app
        self.redis = redis
        self.secret = secret.encode()
        self.default_ttl = default_ttl
        self.swr_ttl = swr_ttl

    def _key(self, route: str, user: Optional[str], query: str, body: bytes) -> str:
        h = hmac.new(self.secret, digestmod=hashlib.sha256)
        h.update(route.encode())
        h.update(b"|u=" + (user or "anon").encode())
        h.update(b"|q=" + query.encode())
        if body:
            h.update(b"|b=" + hashlib.sha256(body).digest())
        return "cache:" + base64.urlsafe_b64encode(h.digest()).decode().rstrip("=")

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if scope["method"] not in ("GET", "HEAD"):
            return await self.app(scope, receive, send)

        route = scope.get("path", "/")
        query = scope.get("query_string", b"").decode()
        user = None

        # Buffer body-less GET
        body_bytes = b""
        key = self._key(route, user, query, body_bytes)
        meta_key = key + ":meta"

        # Try cache
        raw = await self.redis.get(key)
        meta = await self.redis.hgetall(meta_key)
        if raw and meta:
            CACHE_HIT.labels(route=route).inc()
            # Serve fresh or stale
            age = time.time() - float(meta.get(b"ts", b"0"))
            if age > self.default_ttl and age <= self.swr_ttl:
                CACHE_STALE.labels(route=route).inc()
                # kick background refresh
                asyncio.create_task(self._refresh(scope, receive, key, meta_key, route))
            headers = [(b"content-type", meta.get(b"ct", b"application/json"))]
            await send({"type": "http.response.start", "status": int(meta.get(b"status", b"200")), "headers": headers})
            await send({"type": "http.response.body", "body": raw})
            return

        CACHE_MISS.labels(route=route).inc()
        # Miss → proxy to app; capture response
        await self._populate_and_forward(scope, receive, send, key, meta_key, route)

    async def _refresh(self, scope, receive, key, meta_key, route):
        try:
            CACHE_FILL.labels(route=route).inc()
            await self._populate(scope, key, meta_key, route)
        finally:
            CACHE_FILL.labels(route=route).dec()

    async def _populate_and_forward(self, scope, receive, send, key, meta_key, route):
        # Intercept downstream response
        chunks = []
        status_code = 200
        headers = {}

        async def send_wrapper(message):
            nonlocal status_code, headers, chunks
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = {k.decode(): v.decode() for k, v in message.get("headers", [])}
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                if body:
                    chunks.append(body)
            await send(message)

        await self.app(scope, receive, send_wrapper)
        # Populate cache (best-effort)
        try:
            body = b"".join(chunks)
            ct = headers.get("content-type", "application/json")
            pipe = self.redis.pipeline()
            pipe.set(key, body, ex=self.swr_ttl)
            pipe.hmset(meta_key, mapping={"status": str(status_code), "ct": ct, "ts": str(time.time())})
            pipe.expire(meta_key, self.swr_ttl)
            await pipe.execute()
        except Exception:
            pass

    async def _populate(self, scope, key, meta_key, route):
        # Clone scope minimally for GET refresh
        chunks = []
        status_code = 200
        headers = {}

        async def blackhole_send(message):
            nonlocal status_code, headers, chunks
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = {k.decode(): v.decode() for k, v in message.get("headers", [])}
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                if body:
                    chunks.append(body)

        await self.app(scope, _noop_receive, blackhole_send)  # _noop_receive can return empty body for refresh
        body = b"".join(chunks)
        ct = headers.get("content-type", "application/json")
        pipe = self.redis.pipeline()
        pipe.set(key, body, ex=self.swr_ttl)
        pipe.hmset(meta_key, mapping={"status": str(status_code), "ct": ct, "ts": str(time.time())})
        pipe.expire(meta_key, self.swr_ttl)
        await pipe.execute()

async def _noop_receive():
    return {"type": "http.request", "body": b"", "more_body": False}