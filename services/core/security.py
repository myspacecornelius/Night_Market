"""JWT settings and password hashing.

Token creation and the ``get_current_*`` dependencies live in
``services.core.auth``.
"""
import logging
import os

from passlib.context import CryptContext

logger = logging.getLogger(__name__)

DEFAULT_SECRET = "development-only-key-change-in-production"
SECRET_KEY = os.getenv("JWT_SECRET_KEY", DEFAULT_SECRET)
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

if SECRET_KEY == DEFAULT_SECRET and os.getenv("ENVIRONMENT") == "production":
    raise ValueError("JWT_SECRET_KEY must be set in production environment")

if len(SECRET_KEY) < 32:
    raise ValueError("JWT_SECRET_KEY must be at least 32 characters for HMAC signatures.")

if SECRET_KEY == DEFAULT_SECRET:
    logger.warning("Using development JWT secret – do not use this configuration in production.")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)
