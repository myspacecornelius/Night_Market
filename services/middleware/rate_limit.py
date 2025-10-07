from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import time
import redis

from services.core.rate_limiting import RateLimiter, get_rate_limit_config


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for applying rate limits to all routes"""
    
    def __init__(self, app: ASGIApp, redis_client: redis.Redis):
        super().__init__(app)
        self.limiter = RateLimiter(redis_client)
    
    async def dispatch(self, request: Request, call_next):
        """Apply rate limiting to requests"""
        # Skip rate limiting for health checks and static files
        if request.url.path in ["/health", "/metrics", "/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)
        
        # Skip rate limiting for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Get rate limit configuration for this route
        route = request.url.path
        config = get_rate_limit_config(route)
        
        # Check rate limit
        try:
            rate_info = self.limiter.check_rate_limit(
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
            print(f"Rate limiting error: {e}")
            pass
        
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