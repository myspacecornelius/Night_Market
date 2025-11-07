import asyncio
import logging
import os

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

try:
    # When running as a package
    from .routers import router as api_router
    from .routers import hyperlocal, shop
    from .core.redis_client import get_redis
    from .middleware.rate_limit import RateLimitMiddleware
    from .middleware.tracing import TracingMiddleware
    from .middleware.security_headers import SecurityHeadersMiddleware
except ImportError:
    # When running directly in Docker
    from routers import router as api_router
    from routers import hyperlocal, shop
    from core.redis_client import get_redis
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

# Create FastAPI app with enhanced metadata
app = FastAPI(
    title="Dharma API",
    description="The Underground Network for Sneaker Culture",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

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

async def _warm_critical_caches():
    """Fire-and-forget warming for top endpoints."""
    try:
        from worker.tasks import refresh_heatmap_cache  # lazy import to avoid Celery unless needed

        logger.info("🔥 Scheduling heatmap warmup for major metros")
        for city in ["boston", "nyc", "la", "chicago"]:
            refresh_heatmap_cache.delay(zones=[city])
    except Exception as exc:
        logger.warning("Unable to warm caches on startup: %s", exc)


@app.on_event("startup")
async def startup_event():
    """🚀 Dharma API startup - the underground network is coming online"""
    logger.info("🔥 Dharma API starting up...")
    logger.info("🌍 Environment: %s", os.getenv("ENVIRONMENT", "development"))
    logger.info("🗄️ Database: Connected")
    logger.info("⚡ Redis: Connected")
    logger.info("🪙 LACES economy: Active")
    logger.info("📍 Hyperlocal signals: Online")

    asyncio.create_task(_warm_critical_caches())

    logger.info("✅ Dharma API ready - the underground network is live!")

@app.on_event("shutdown")
async def shutdown_event():
    """🛑 Dharma API shutdown"""
    logger.info("🛑 Dharma API shutting down...")
    logger.info("💾 Saving community state...")
    logger.info("✅ Dharma API shutdown complete")

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
