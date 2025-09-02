from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Generator, Iterator

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Load .env when running locally (safe no-op in containers if not present)
load_dotenv()

# --- Environment & URL normalization -------------------------------------------------
# Prefer psycopg3 dialect for Postgres. If a plain postgresql:// URL is provided,
# auto-upgrade it to postgresql+psycopg:// so SQLAlchemy uses the modern driver.
raw_url = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/dharma")
if raw_url.startswith("postgresql://") and "+" not in raw_url:
    DATABASE_URL = raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
else:
    DATABASE_URL = raw_url

SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() in {"1", "true", "yes", "on"}
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "5"))
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "10"))

# --- Engine & Session ----------------------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    echo=SQL_ECHO,
    pool_pre_ping=True,   # proactively test connections to avoid stale sockets
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    future=True,
)

class Base(DeclarativeBase):
    """Base for ORM models. Import this in models and Alembic env.py."""
    pass

# expire_on_commit=False so objects remain usable after commit in request scope
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency: yields a DB session per-request.
    Usage:
        def endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """
    Context-manager for scripts/jobs:
        with session_scope() as db:
            db.add(...)
    Automatically commits on success, rolls back on error.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def db_healthcheck() -> bool:
    """Return True if a simple `SELECT 1` succeeds, False otherwise."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def init_db(create_all: bool = False) -> None:
    """
    Optional helper for local/dev usage. If `create_all` is True, run metadata.create_all.
    For production, use Alembic migrations instead of create_all.
    """
    if create_all:
        Base.metadata.create_all(bind=engine)


__all__ = [
    "Base",
    "engine",
    "SessionLocal",
    "get_db",
    "session_scope",
    "db_healthcheck",
    "init_db",
]
