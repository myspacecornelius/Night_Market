import asyncio
import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sqlalchemy.exc import DataError, IntegrityError

try:
    # When running as a package
    from .routers import router as api_router
    from .routers import hyperlocal, shop
    from .core.redis_client import get_redis
    from .database import db_healthcheck
    from .middleware.rate_limit import RateLimitMiddleware
    from .middleware.tracing import TracingMiddleware
    from .middleware.security_headers import SecurityHeadersMiddleware
    from .middleware.body_limit import BodySizeLimitMiddleware, DEFAULT_MAX_BODY_BYTES
    from .middleware.errors import UnhandledErrorMiddleware
    from .core.security import DEVELOPMENT_ENVIRONMENTS, ENVIRONMENT
except ImportError:
    # When running directly in Docker
    from routers import router as api_router
    from routers import hyperlocal, shop
    from core.redis_client import get_redis
    from services.database import db_healthcheck
    from middleware.rate_limit import RateLimitMiddleware
    from middleware.tracing import TracingMiddleware
    from middleware.security_headers import SecurityHeadersMiddleware
    from middleware.body_limit import BodySizeLimitMiddleware, DEFAULT_MAX_BODY_BYTES
    from middleware.errors import UnhandledErrorMiddleware
    from services.core.security import DEVELOPMENT_ENVIRONMENTS, ENVIRONMENT

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("dharma.api")

# Sentry instrumentation (optional)
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=float(os.getenv("TRACES_SAMPLE_RATE", "0.1")),
        profiles_sample_rate=float(os.getenv("PROFILES_SAMPLE_RATE", "0.1")),
        environment=os.getenv("ENVIRONMENT", "development"),
    )
    logger.info("🛰️ Sentry enabled")

async def _warm_critical_caches():
    """Fire-and-forget warming for top endpoints."""
    try:
        from worker.tasks import refresh_heatmap_cache  # lazy import to avoid Celery unless needed

        logger.info("🔥 Scheduling heatmap warmup for major metros")
        for city in ["boston", "nyc", "la", "chicago"]:
            refresh_heatmap_cache.delay(zones=[city])
    except Exception as exc:
        logger.warning("Unable to warm caches on startup: %s", exc)


def _redis_healthcheck() -> bool:
    try:
        return bool(get_redis().ping())
    except Exception:
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown: report what is actually reachable, then warm caches."""
    logger.info("🔥 Dharma API starting up...")
    logger.info("🌍 Environment: %s", os.getenv("ENVIRONMENT", "development"))
    logger.info("🗄️ Database: %s", "connected" if db_healthcheck() else "NOT REACHABLE")
    logger.info("⚡ Redis: %s", "connected" if _redis_healthcheck() else "NOT REACHABLE")

    warmup = asyncio.create_task(_warm_critical_caches())

    logger.info("✅ Dharma API ready - the underground network is live!")
    yield
    warmup.cancel()
    logger.info("🛑 Dharma API shutdown complete")


DOCS_ENABLED = os.getenv("ENABLE_DOCS", "true" if ENVIRONMENT in DEVELOPMENT_ENVIRONMENTS else "false").lower() in {
    "1", "true", "yes", "on",
}

# Create FastAPI app with enhanced metadata
app = FastAPI(
    title="Dharma API",
    description="The Underground Network for Sneaker Culture",
    version="1.0.0",
    # Interactive docs and the schema are served in development only, unless ENABLE_DOCS says otherwise
    docs_url="/docs" if DOCS_ENABLED else None,
    redoc_url="/redoc" if DOCS_ENABLED else None,
    openapi_url="/openapi.json" if DOCS_ENABLED else None,
    lifespan=lifespan,
)


# Safety net: a constraint or type error that a route did not anticipate is the
# client's problem (conflict / bad value), not a 500. Routes should still
# validate their own input; this only catches what slips through.
@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    logger.warning("Integrity error on %s %s: %s", request.method, request.url.path, exc.orig)
    return JSONResponse(status_code=409, content={"detail": "The request conflicts with existing data"})


@app.exception_handler(DataError)
async def data_error_handler(request: Request, exc: DataError):
    logger.warning("Data error on %s %s: %s", request.method, request.url.path, exc.orig)
    return JSONResponse(status_code=422, content={"detail": "A value in the request is not valid"})


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    # PostgreSQL text cannot hold NUL bytes; the driver reports that as a bare ValueError.
    if "NUL (0x00)" in str(exc):
        return JSONResponse(status_code=422, content={"detail": "Text values must not contain NUL bytes"})
    raise exc


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # The default handler echoes the rejected input. NaN, Infinity or a lone surrogate
    # ("\ud800") in it cannot be serialised as JSON and turned a 422 into a 500. Echo
    # such values in a form that can be.
    def safe(value):
        if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
            return str(value)
        if isinstance(value, str):
            return value.encode("utf-8", "backslashreplace").decode("utf-8")
        if isinstance(value, dict):
            return {key: safe(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [safe(item) for item in value]
        return value

    errors = [{key: safe(item) for key, item in error.items() if key != "ctx"} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})

# Add prometheus asgi middleware to route /metrics requests
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# Middleware. Starlette runs the middleware added LAST first, so the order below is
# innermost to outermost. CORS and the security headers must be outside everything
# that can produce a response (rate limiting used to be outermost, so its 429s had
# neither set of headers and a browser could not read them).

# Rate limiting - protect against abuse
try:
    redis_client = get_redis()
    app.add_middleware(RateLimitMiddleware, redis_client=redis_client)
    logger.info("🛡️ Rate limiting middleware enabled")
except Exception as e:
    logger.warning(f"⚠️ Rate limiting disabled: {e}")
    logger.info("🔧 Continuing without rate limiting in development mode")

# Unhandled exceptions become a JSON 500 here, inside the header middlewares
app.add_middleware(UnhandledErrorMiddleware)

# Reject oversized bodies before anything parses them
app.add_middleware(
    BodySizeLimitMiddleware,
    max_body_bytes=int(os.getenv("MAX_REQUEST_BODY_BYTES", str(DEFAULT_MAX_BODY_BYTES))),
)

# Request id, request log and Prometheus metrics
app.add_middleware(TracingMiddleware)

app.add_middleware(SecurityHeadersMiddleware)

# CORS - configured from environment; outermost so every response carries the headers
cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3001").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enhanced health check endpoint
@app.get("/health")
def health_check():
    """🩺 Health check - verify Dharma is alive and well"""
    return {
        "status": "ok",
        "service": "dharma-api",
        "version": "1.0.0",
        "message": "The underground network is alive! 🔥",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "features": {
            "hyperlocal_signals": True,
            "laces_economy": True,
            "community_feed": True,
            "drop_zones": True
        }
    }

@app.get("/health/ready")
def readiness_check():
    """Readiness: 200 only when the database and Redis are reachable."""
    checks = {"database": db_healthcheck(), "redis": _redis_healthcheck()}
    ready = all(checks.values())
    return JSONResponse(status_code=200 if ready else 503, content={"status": "ready" if ready else "degraded", "checks": checks})


# Root endpoint with welcome message
@app.get("/")
def root():
    """🏠 Welcome to Dharma - The Underground Network for Sneaker Culture"""
    return {
        "message": "Welcome to Dharma 🔥",
        "tagline": "The Underground Network for Sneaker Culture",
        "docs": "/docs" if DOCS_ENABLED else None,
        "health": "/health",
        "version": "1.0.0",
        "community": {
            "discord": "https://discord.gg/dharma",
            "twitter": "@DharmaNetwork",
            "github": "https://github.com/myspacecornelius/Dharma"
        }
    }

# Include API routers
app.include_router(api_router)
app.include_router(hyperlocal.router, prefix="/v1", tags=["hyperlocal"])
app.include_router(shop.router, prefix="/v1", tags=["shop"])

if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 Starting Dharma API server...")
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=int(os.getenv("API_PORT", "8000")),
        log_level="info"
    )
