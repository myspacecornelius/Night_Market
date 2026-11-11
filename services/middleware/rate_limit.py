from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import logging
import time
import redis

from services.core.rate_limiting import RateLimiter, get_rate_limit_for_request

logger = logging.getLogger("dharma.rate_limit")


# After Redis fails, requests are let through without asking it again for this long.
# Otherwise every request would wait for the socket timeout before failing open.
REDIS_RETRY_AFTER_SECONDS = 5.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for applying rate limits to all routes"""
    
    def __init__(self, app: ASGIApp, redis_client: redis.Redis):
        super().__init__(app)
        self.limiter = RateLimiter(redis_client)
        self._skip_until = 0.0
    
    async def dispatch(self, request: Request, call_next):
        """Apply rate limiting to requests"""
        # Skip rate limiting for health checks and static files
        if request.url.path in ["/health", "/health/ready", "/metrics", "/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)
        
        # Skip rate limiting for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Redis failed a moment ago: let requests through until it has had time to recover
        if time.monotonic() < self._skip_until:
            return await call_next(request)

        # Check rate limit
        try:
            # The limit for this HTTP method on this exact route (not a path prefix).
            # Per-user limits are counted against the user in the bearer token.
            route, config = get_rate_limit_for_request(request)
            
            # The Redis client blocks, so the check runs in a worker thread: on the event
            # loop, one request waiting for Redis held up every other request too.
            rate_info = await run_in_threadpool(
                self.limiter.check_rate_limit,
                request=request,
                route=route,
                max_requests=config["max_requests"],
                window_seconds=config["window"],
                per_user=config["per_user"]
            )
            
            if rate_info["is_limited"]:
                # Log the violation
                self.limiter.log_violation(request, rate_info, route)
                
                # Return 429 Too Many Requests
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": f"Rate limit exceeded. Try again in {rate_info['retry_after']} seconds.",
                        "retry_after": rate_info["retry_after"]
                    },
                    headers={
                        "Retry-After": str(rate_info["retry_after"]),
                        "X-RateLimit-Limit": str(rate_info["max_requests"]),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(int(time.time() + rate_info["retry_after"]))
                    }
                )
            
            # Store rate limit info for response headers
            request.state.rate_limit_info = rate_info
            
        except Exception as e:
            # If rate limiting fails, log error but don't block request
            logger.warning("Rate limiting error: %s", e)
            self._skip_until = time.monotonic() + REDIS_RETRY_AFTER_SECONDS
        
        # Process the request
        response = await call_next(request)
        
        # Add rate limit headers to response if available
        if hasattr(request.state, 'rate_limit_info'):
            rate_info = request.state.rate_limit_info
            response.headers["X-RateLimit-Limit"] = str(rate_info["max_requests"])
            response.headers["X-RateLimit-Remaining"] = str(
                max(0, rate_info["max_requests"] - rate_info["current_requests"] - 1)
            )
            response.headers["X-RateLimit-Reset"] = str(
                int(time.time() + rate_info["window_seconds"])
            )
        
        return response


class RateLimitHeaders:
    """Helper class for adding rate limit headers to responses"""
    
    @staticmethod
    def add_headers(response: Response, rate_info: dict):
        """Add rate limit headers to response"""
        response.headers["X-RateLimit-Limit"] = str(rate_info["max_requests"])
        response.headers["X-RateLimit-Remaining"] = str(
            max(0, rate_info["max_requests"] - rate_info["current_requests"])
        )
        response.headers["X-RateLimit-Reset"] = str(
            int(time.time() + rate_info["window_seconds"])
        )