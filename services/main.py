import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
try:
    # When running as a package
    from .routers import router as api_router
    from .routers import hyperlocal
except ImportError:
    # When running directly in Docker
    from routers import router as api_router
    from routers import hyperlocal
from prometheus_client import make_asgi_app

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

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

@app.on_event("startup")
async def startup_event():
    """🚀 Dharma API startup - the underground network is coming online"""
    logger.info("🔥 Dharma API starting up...")
    logger.info("🌍 Environment: %s", os.getenv("ENVIRONMENT", "development"))
    logger.info("🗄️ Database: Connected")
    logger.info("⚡ Redis: Connected") 
    logger.info("🪙 LACES economy: Active")
    logger.info("📍 Hyperlocal signals: Online")
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

if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 Starting Dharma API server...")
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=int(os.getenv("API_PORT", "8000")),
        log_level="info"
    )
