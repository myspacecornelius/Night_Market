"""JWT settings and password hashing.

Token creation and the ``get_current_*`` dependencies live in
``services.core.auth``.
"""
import logging
import os

from passlib.context import CryptContext

logger = logging.getLogger(__name__)

DEFAULT_SECRET = "development-only-key-change-in-production"
# Secrets anyone can read in this repository. They sign tokens only in development and tests.
PUBLIC_SECRETS = frozenset({
    DEFAULT_SECRET,
    "dharma_jwt_secret_key_change_in_production_use_openssl_rand_hex_32",  # .env.example
})
DEVELOPMENT_ENVIRONMENTS = frozenset({"development", "dev", "local", "test", "testing", "ci"})

ENVIRONMENT = os.getenv("ENVIRONMENT", "").strip().lower()
SECRET_KEY = os.getenv("JWT_SECRET_KEY", DEFAULT_SECRET)
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# Fail closed: anything that is not explicitly a development environment (including
# an unset or misspelled ENVIRONMENT) needs a private secret, because a token signed
# with a published secret is accepted as any user, admins included.
if SECRET_KEY in PUBLIC_SECRETS and ENVIRONMENT not in DEVELOPMENT_ENVIRONMENTS:
    raise ValueError(
        "JWT_SECRET_KEY is unset or is a published example value. Set a private secret "
        "(for example: openssl rand -hex 32), or set ENVIRONMENT=development for local work."
    )

if len(SECRET_KEY) < 32:
    raise ValueError("JWT_SECRET_KEY must be at least 32 characters for HMAC signatures.")

if SECRET_KEY in PUBLIC_SECRETS:
    logger.warning("Using a published development JWT secret – never deploy this configuration.")

# bcrypt hash of a throwaway string: login verifies against it when the account does
# not exist, so an unknown user takes as long to reject as a wrong password.
DUMMY_PASSWORD_HASH = "$2b$12$3.l6c/tCW4Jby5S2te4h5O345soL8ChrAXeOBrJQ7JNu2wJ2fZbHS"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)
