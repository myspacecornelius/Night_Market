import asyncio
import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
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
except ImportError:
    # When running directly in Docker
    from routers import router as api_router
    from routers import hyperlocal, shop
    from core.redis_client import get_redis
    from services.database import db_healthcheck
    from middleware.rate_limit import RateLimitMiddleware
    from middleware.tracing import TracingMiddleware
    from middleware.security_headers import SecurityHeadersMiddleware

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


# Create FastAPI app with enhanced metadata
app = FastAPI(
    title="Dharma API",
    description="The Underground Network for Sneaker Culture",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
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

# Add prometheus asgi middleware to route /metrics requests
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# CORS middleware - configured from environment
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security & tracing middlewares
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TracingMiddleware)

# Rate limiting middleware - protect against abuse
try:
    redis_client = get_redis()
    app.add_middleware(RateLimitMiddleware, redis_client=redis_client)
    logger.info("🛡️ Rate limiting middleware enabled")
except Exception as e:
    logger.warning(f"⚠️ Rate limiting disabled: {e}")
    logger.info("🔧 Continuing without rate limiting in development mode")

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
        "docs": "/docs",
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
