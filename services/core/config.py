from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Centralized application settings"""

    # Database
    DATABASE_URL: str
    POSTGRES_USER: str = "dharma"
    POSTGRES_PASSWORD: str = "password"
    POSTGRES_DB: str = "dharma"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # API
    API_PORT: int = 8000
    SECRET_KEY: str
    JWT_SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # LACES Token Configuration
    LACES_DAILY_STIPEND: int = 10
    LACES_POST_REWARD: int = 5
    LACES_CHECKIN_REWARD: int = 3
    LACES_HELPFUL_BOOST: int = 2

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 10

    # Geospatial
    DEFAULT_GEOHASH_PRECISION: int = 6
    DROPZONE_CHECKIN_RADIUS_METERS: float = 100.0

    # Monitoring
    ENABLE_METRICS: bool = True
    METRICS_PORT: int = 9090

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
