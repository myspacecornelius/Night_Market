"""Turn an unhandled exception into a JSON 500 inside the middleware stack.

Starlette's own 500 handler sits outside every user middleware, so its responses
carried neither CORS nor security headers and a browser client could not read them.
"""
from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("dharma.errors")


class UnhandledErrorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            logger.exception("Unhandled error on %s %s", request.method, request.url.path)
            return JSONResponse(status_code=500, content={"detail": "Internal server error"})
