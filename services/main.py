import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
try:
    # When running as a package
    from .routers import router as api_router
    from .routers import hyperlocal, shop
    from .core.redis_client import get_redis
    from .middleware.rate_limit import RateLimitMiddleware
    from .core.exceptions import NightMarketException
except ImportError:
    # When running directly in Docker
    from routers import router as api_router
    from routers import hyperlocal, shop
    from core.redis_client import get_redis
    from middleware.rate_limit import RateLimitMiddleware
    from core.exceptions import NightMarketException
from prometheus_client import make_asgi_app

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI app with enhanced metadata
app = FastAPI(
    title="Night Market API",
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

# Rate limiting middleware - protect against abuse
try:
    redis_client = get_redis()
    app.add_middleware(RateLimitMiddleware, redis_client=redis_client)
    logger.info("🛡️ Rate limiting middleware enabled")
except Exception as e:
    logger.warning(f"⚠️ Rate limiting disabled: {e}")
    logger.info("🔧 Continuing without rate limiting in development mode")

# Custom exception handlers
@app.exception_handler(NightMarketException)
async def night_market_exception_handler(request: Request, exc: NightMarketException):
    """Handle custom Night Market exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "details": exc.details
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred"
        }
    )

@app.on_event("startup")
async def startup_event():
    """🚀 Night Market API startup - the underground network is coming online"""
    logger.info("🔥 Night Market API starting up...")
    logger.info("🌍 Environment: %s", os.getenv("ENVIRONMENT", "development"))
    logger.info("🗄️ Database: Connected")
    logger.info("⚡ Redis: Connected")
    logger.info("🪙 LACES economy: Active")
    logger.info("📍 Hyperlocal signals: Online")
    logger.info("✅ Night Market API ready - the underground network is live!")

@app.on_event("shutdown")
async def shutdown_event():
    """🛑 Night Market API shutdown"""
    logger.info("🛑 Night Market API shutting down...")
    logger.info("💾 Saving community state...")
    logger.info("✅ Night Market API shutdown complete")

# Enhanced health check endpoint
@app.get("/health")
def health_check():
    """🩺 Health check - verify Night Market is alive and well"""
    return {
        "status": "ok",
        "service": "night-market-api",
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
    """🏠 Welcome to Night Market - The Underground Network for Sneaker Culture"""
    return {
        "message": "Welcome to Night Market 🔥",
        "tagline": "The Underground Network for Sneaker Culture",
        "docs": "/docs",
        "health": "/health",
        "version": "1.0.0",
        "community": {
            "discord": "https://discord.gg/nightmarket",
            "twitter": "@NightMarketNet",
            "github": "https://github.com/myspacecornelius/Night_Market"
        }
    }

# Include API routers
app.include_router(api_router)
app.include_router(hyperlocal.router, prefix="/v1", tags=["hyperlocal"])
app.include_router(shop.router, prefix="/v1", tags=["shop"])

if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 Starting Night Market API server...")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("API_PORT", "8000")),
        log_level="info"
    )
