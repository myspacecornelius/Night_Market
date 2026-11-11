from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

from services.core.metrics import HTTP_REQUEST_DURATION, HTTP_REQUESTS

logger = logging.getLogger("dharma.tracing")


class TracingMiddleware(BaseHTTPMiddleware):
    """
    Attaches a correlation ID to every request and logs completion details.
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        start_time = time.perf_counter()

        request.state.request_id = request_id
        request.state.start_time = start_time

        status_code = 500  # what the client gets if the handler raises
        try:
            response = await call_next(request)
            status_code = response.status_code
        finally:
            duration = time.perf_counter() - start_time
            # The matched route's template; unmatched paths share one label value.
            route = request.scope.get("route")
            route_label = getattr(route, "path", None) or "unmatched"
            if route_label != "/metrics":
                HTTP_REQUESTS.labels(request.method, route_label, str(status_code)).inc()
                HTTP_REQUEST_DURATION.labels(request.method, route_label).observe(duration)
        duration_ms = duration * 1000

        response.headers["X-Request-ID"] = request_id

        # The details are in the message itself: the configured log format prints only
        # the message, so as "extra" fields alone they never reached the log.
        logger.info(
            "%s %s -> %s in %.1f ms [%s]",
            request.method, request.url.path, response.status_code, duration_ms, request_id,
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
                "client_ip": request.client.host if request.client else None,
            },
        )

        return response

