import time
import redis
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, status
from functools import wraps
import json
import hashlib

class RateLimiter:
    """Redis-based rate limiter with sliding window and multiple strategies"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        
    def _get_client_id(self, request: Request) -> str:
        """Generate client identifier for rate limiting"""
        # Try to get user ID from token if authenticated
        user_id = getattr(request.state, 'user_id', None)
        if user_id:
            return f"user:{user_id}"
        
        # Fall back to IP address
        ip = request.client.host if request.client else "unknown"
        return f"ip:{ip}"
    
    def _get_key(self, identifier: str, route: str, window: str) -> str:
        """Generate Redis key for rate limit tracking"""
        return f"rate_limit:{identifier}:{route}:{window}"
    
    def check_rate_limit(
        self, 
        request: Request, 
        route: str,
        max_requests: int, 
        window_seconds: int,
        per_user: bool = False
    ) -> Dict[str, Any]:
        """
        Check if request should be rate limited using sliding window
        
        Args:
            request: FastAPI request object
            route: Route identifier (e.g., "/auth/token")
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds
            per_user: If True, apply limit per authenticated user, else per IP
            
        Returns:
            Dict with rate limit info
        """
        identifier = self._get_client_id(request)
        
        # Override identifier for per-user limits
        if per_user and hasattr(request.state, 'user_id'):
            identifier = f"user:{request.state.user_id}"
        
        current_time = time.time()
        window_start = current_time - window_seconds
        
        # Redis key for this rate limit window
        key = self._get_key(identifier, route, str(window_seconds))
        
        # Use Redis sorted set for sliding window
        pipe = self.redis.pipeline()
        
        # Remove expired entries
        pipe.zremrangebyscore(key, 0, window_start)
        
        # Count current requests in window
        pipe.zcard(key)
        
        # Add current request
        pipe.zadd(key, {str(current_time): current_time})
        
        # Set expiration on the key
        pipe.expire(key, window_seconds + 1)
        
        results = pipe.execute()
        current_requests = results[1]
        
        # Check if limit exceeded
        is_limited = current_requests >= max_requests
        
        # Calculate retry after time
        if is_limited:
            # Get oldest request in current window
            oldest_requests = self.redis.zrange(key, 0, 0, withscores=True)
            if oldest_requests:
                oldest_time = oldest_requests[0][1]
                retry_after = int(oldest_time + window_seconds - current_time) + 1
            else:
                retry_after = window_seconds
        else:
            retry_after = 0
        
        return {
            "is_limited": is_limited,
            "current_requests": current_requests,
            "max_requests": max_requests,
            "window_seconds": window_seconds,
            "retry_after": retry_after,
            "identifier": identifier
        }
    
    def log_violation(self, request: Request, rate_info: Dict[str, Any], route: str):
        """Log rate limit violation for monitoring"""
        violation_key = f"rate_violations:{rate_info['identifier']}:{route}"
        
        violation_data = {
            "timestamp": time.time(),
            "route": route,
            "ip": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("User-Agent", "unknown"),
            "current_requests": rate_info["current_requests"],
            "max_requests": rate_info["max_requests"]
        }
        
        # Store violation with 1 hour expiration
        self.redis.setex(
            violation_key,
            3600,
            json.dumps(violation_data)
        )
        
    def get_rate_limit_status(self, request: Request, route: str, window_seconds: int) -> Dict[str, Any]:
        """Get current rate limit status without incrementing counter"""
        identifier = self._get_client_id(request)
        current_time = time.time()
        window_start = current_time - window_seconds
        
        key = self._get_key(identifier, route, str(window_seconds))
        
        # Clean and count without adding
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        results = pipe.execute()
        
        return {
            "current_requests": results[1],
            "identifier": identifier,
            "window_seconds": window_seconds
        }

# Rate limit configurations for different endpoints
RATE_LIMIT_CONFIGS = {
    "/auth/token": {"max_requests": 5, "window": 300, "per_user": False},  # 5 per 5 minutes per IP
    "/auth/refresh": {"max_requests": 10, "window": 300, "per_user": True},  # 10 per 5 minutes per user
    "/auth/register": {"max_requests": 3, "window": 3600, "per_user": False},  # 3 per hour per IP
    "/signals": {"max_requests": 100, "window": 3600, "per_user": True},  # 100 per hour per user
    "/posts": {"max_requests": 50, "window": 3600, "per_user": True},  # 50 per hour per user
    "default": {"max_requests": 1000, "window": 3600, "per_user": False},  # Default: 1000 per hour per IP
}

def get_rate_limit_config(route: str) -> Dict[str, Any]:
    """Get rate limit configuration for a route"""
    # Try exact match first
    if route in RATE_LIMIT_CONFIGS:
        return RATE_LIMIT_CONFIGS[route]
    
    # Try pattern matching for parameterized routes
    for pattern, config in RATE_LIMIT_CONFIGS.items():
        if pattern != "default" and route.startswith(pattern.split("{")[0]):
            return config
    
    # Return default
    return RATE_LIMIT_CONFIGS["default"]

def create_rate_limit_dependency(redis_client: redis.Redis):
    """Create a FastAPI dependency for rate limiting"""
    limiter = RateLimiter(redis_client)
    
    def rate_limit_dependency(request: Request):
        """FastAPI dependency that checks rate limits"""
        route = request.url.path
        config = get_rate_limit_config(route)
        
        rate_info = limiter.check_rate_limit(
            request=request,
            route=route,
            max_requests=config["max_requests"],
            window_seconds=config["window"],
            per_user=config["per_user"]
        )
        
        if rate_info["is_limited"]:
            # Log the violation
            limiter.log_violation(request, rate_info, route)
            
            # Raise HTTP 429 Too Many Requests
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {rate_info['retry_after']} seconds.",
                headers={
                    "Retry-After": str(rate_info["retry_after"]),
                    "X-RateLimit-Limit": str(rate_info["max_requests"]),
                    "X-RateLimit-Remaining": str(max(0, rate_info["max_requests"] - rate_info["current_requests"])),
                    "X-RateLimit-Reset": str(int(time.time() + rate_info["retry_after"]))
                }
            )
        
        # Add rate limit headers to response
        request.state.rate_limit_headers = {
            "X-RateLimit-Limit": str(rate_info["max_requests"]),
            "X-RateLimit-Remaining": str(max(0, rate_info["max_requests"] - rate_info["current_requests"] - 1)),
            "X-RateLimit-Reset": str(int(time.time() + rate_info["window_seconds"]))
        }
        
        return rate_info
    
    return rate_limit_dependency