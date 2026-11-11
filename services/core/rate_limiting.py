import time
import uuid
import redis
from typing import Optional, Dict, Any, Tuple
from fastapi import Request, HTTPException, status
from starlette.routing import Match
import json

from services.core.tokens import TokenError, decode_token


def authenticated_user_id(request: Request) -> Optional[str]:
    """The user a request's bearer token was issued to, or None.

    Only the signature, the expiry and the token type are checked; there is no
    database lookup. That is enough to decide whose budget a request counts
    against (a token that does not verify never picks its own bucket). Whether the
    account may still act is decided by the route.
    """
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        payload = decode_token(token)
    except TokenError:
        return None
    if payload.get("type") != "access":
        return None
    user_id = payload.get("user_id") or payload.get("sub")
    return str(user_id) if user_id else None


def _matching_route(routes, scope) -> Optional[str]:
    for candidate in routes:
        match, _ = candidate.matches(scope)
        if match == Match.FULL:
            return getattr(candidate, "path", None)
    return None


def resolve_route(request: Request) -> Optional[str]:
    """Path template of the route that serves this request ("/posts/{post_id}"), or None.

    Limits and counters use the template, not the raw path, so one limit covers a
    route whatever ids are in the URL and unknown paths share a single counter.
    """
    scope = request.scope
    route = scope.get("route")  # already set when called from a dependency
    if route is not None:
        return getattr(route, "path", None)
    router = getattr(scope.get("app"), "router", None)
    routes = getattr(router, "routes", ())
    template = _matching_route(routes, scope)
    if template is None and getattr(router, "redirect_slashes", False) and scope["path"] != "/":
        # The router answers /posts with a redirect to /posts/ (and the reverse). The
        # redirect is not the operation itself: it gets its own counter per target
        # route, so it neither spends that route's limit nor is lumped with 404s.
        path = scope["path"]
        other = {**scope, "path": path.rstrip("/") if path.endswith("/") else path + "/"}
        target = _matching_route(routes, other)
        if target is not None:
            return f"{target} (redirect)"
    return template


class RateLimiter:
    """Redis-based rate limiter with sliding window and multiple strategies"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        
    def _get_client_id(self, request: Request, per_user: bool = False) -> str:
        """Whose budget a request counts against.

        Per-user limits follow the authenticated user (so people behind one address
        do not share a budget); everything else, and anonymous callers, are counted
        by IP address.
        """
        if per_user:
            user_id = authenticated_user_id(request)
            if user_id:
                return f"user:{user_id}"
        
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
            route: Name of the limit's counter (e.g., "POST /auth/token")
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds
            per_user: If True, apply limit per authenticated user, else per IP
            
        Returns:
            Dict with rate limit info
        """
        identifier = self._get_client_id(request, per_user)
        
        current_time = time.time()
        window_start = current_time - window_seconds
        
        # Redis key for this rate limit window
        key = self._get_key(identifier, route, str(window_seconds))
        # Unique per request, so two requests in the same instant are both counted
        member = f"{current_time}:{uuid.uuid4().hex}"
        
        # Use Redis sorted set for sliding window
        pipe = self.redis.pipeline()
        
        # Remove expired entries
        pipe.zremrangebyscore(key, 0, window_start)
        
        # Add current request and count the window in one transaction, so
        # concurrent requests cannot all slip in under the limit
        pipe.zadd(key, {member: current_time})
        pipe.zcard(key)
        
        # Set expiration on the key
        pipe.expire(key, window_seconds + 1)
        
        results = pipe.execute()
        current_requests = results[2] - 1  # requests already in the window, without this one
        
        # Check if limit exceeded
        is_limited = current_requests >= max_requests
        
        # Calculate retry after time
        if is_limited:
            # Only allowed requests stay recorded. A refused one must not push the
            # window forward, or a client that keeps polling is never let back in.
            self.redis.zrem(key, member)
            
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
        
    def get_rate_limit_status(self, request: Request, route: str, window_seconds: int, per_user: bool = False) -> Dict[str, Any]:
        """Get current rate limit status without incrementing counter"""
        identifier = self._get_client_id(request, per_user)
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

# Rate limit configurations, keyed by HTTP method and exact route (the path template
# the router matches, see resolve_route). Nothing is matched by prefix: the limit on
# creating posts must not also cap reading feeds. "per_user" counts an authenticated
# caller by the user in their bearer token and anyone else by IP address. Routes that
# do the same thing name a shared "counter", so the limit cannot be doubled by
# alternating between them.
REGISTRATION_LIMIT: Dict[str, Any] = {"max_requests": 5, "window": 3600, "per_user": False, "counter": "register"}
POSTING_LIMIT: Dict[str, Any] = {"max_requests": 50, "window": 3600, "per_user": True, "counter": "create-post"}

RATE_LIMIT_CONFIGS: Dict[Tuple[str, str], Dict[str, Any]] = {
    ("POST", "/auth/token"): {"max_requests": 5, "window": 300, "per_user": False},  # 5 per 5 minutes per IP
    ("POST", "/auth/refresh"): {"max_requests": 10, "window": 300, "per_user": True},  # 10 per 5 minutes per user
    # Each attempt checks the current password, so this is a place to guess it from a stolen session
    ("POST", "/auth/password"): {"max_requests": 5, "window": 900, "per_user": True},  # 5 per 15 minutes per user
    # Registration is served on two routes: 5 per hour per IP across both
    ("POST", "/auth/register"): REGISTRATION_LIMIT,
    ("POST", "/users/"): REGISTRATION_LIMIT,
    ("POST", "/v1/signals/"): {"max_requests": 100, "window": 3600, "per_user": True},  # 100 per hour per user
    # Posts are created on two routes: 50 per hour per user across both
    ("POST", "/posts/"): POSTING_LIMIT,
    ("POST", "/v1/hyperlocal/signals"): POSTING_LIMIT,
}

# Every other route: 1000 per hour, counted per route and per user (or per IP when anonymous)
DEFAULT_RATE_LIMIT: Dict[str, Any] = {"max_requests": 1000, "window": 3600, "per_user": True}

UNMATCHED_ROUTE = "unmatched"

def get_rate_limit_config(method: str, route: str) -> Dict[str, Any]:
    """Get rate limit configuration for an HTTP method on one exact route"""
    return RATE_LIMIT_CONFIGS.get((method.upper(), route), DEFAULT_RATE_LIMIT)

def get_rate_limit_for_request(request: Request) -> Tuple[str, Dict[str, Any]]:
    """Counter name ("POST /posts/") and limit configuration for a request"""
    route = resolve_route(request) or UNMATCHED_ROUTE
    config = get_rate_limit_config(request.method, route)
    return config.get("counter") or f"{request.method} {route}", config

def create_rate_limit_dependency(redis_client: redis.Redis):
    """Create a FastAPI dependency for rate limiting"""
    limiter = RateLimiter(redis_client)
    
    def rate_limit_dependency(request: Request):
        """FastAPI dependency that checks rate limits"""
        route, config = get_rate_limit_for_request(request)
        
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