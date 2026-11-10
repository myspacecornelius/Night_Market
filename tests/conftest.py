import os
import sys
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

# Add the root of the project to the Python path
sys.path.insert(0, str(ROOT))

# Tests always run against a dedicated database, never the one in .env / the
# shell's DATABASE_URL. Override with TEST_DATABASE_URL (needs PostGIS).
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/dharma_test"
)
os.environ.setdefault("JWT_SECRET_KEY", "test-only-jwt-secret-key-0123456789abcdef")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ENVIRONMENT", "test")


@pytest.fixture(scope="session")
def migrated_db():
    """Engine for the test database with every Alembic migration applied."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import OperationalError

    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            conn.commit()
    except OperationalError as exc:
        if os.getenv("CI"):
            raise
        pytest.skip(f"Postgres/PostGIS not reachable at {engine.url!r}: {exc}")

    config = Config(str(ROOT / "services" / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "services" / "alembic"))
    command.upgrade(config, "head")

    yield engine
    engine.dispose()


@pytest.fixture
def db_session(migrated_db):
    """ORM session inside a transaction that is rolled back after each test."""
    from sqlalchemy.orm import Session

    connection = migrated_db.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session):
    """API client whose requests share the test's rolled-back transaction."""
    from fastapi.testclient import TestClient

    from services import database as models_database
    from services.core import database as core_database
    from services.core.redis_client import r as redis_client
    from services.main import app

    def _get_db():
        yield db_session

    app.dependency_overrides[models_database.get_db] = _get_db
    app.dependency_overrides[core_database.get_db] = _get_db

    # Rate-limit counters are per client IP; drop only the test client's.
    for key in redis_client.scan_iter("rate_limit:ip:testclient:*"):
        redis_client.delete(key)

    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db_session):
    """Factory for users that exist only inside the test transaction."""
    from services.models.user import User

    def _make_user(*, is_admin: bool = False, laces_balance: int = 100, password_hash: str = "not-a-real-hash"):
        suffix = uuid.uuid4().hex[:12]
        user = User(
            username=f"user_{suffix}",
            email=f"user_{suffix}@example.com",
            display_name="Test User",
            password_hash=password_hash,
            is_admin=is_admin,
            laces_balance=laces_balance,
        )
        db_session.add(user)
        db_session.commit()
        return user

    return _make_user


@pytest.fixture
def auth_headers():
    """Bearer headers for a user, without spending the login rate limit."""
    from services.core.auth import create_access_token

    def _auth_headers(user) -> dict:
        token = create_access_token({"sub": user.username, "user_id": str(user.user_id)})
        return {"Authorization": f"Bearer {token}"}

    return _auth_headers
