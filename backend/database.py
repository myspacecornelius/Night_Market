"""
Compat shim: re-export database primitives from backend.core.database
to keep models importing Base from backend.database consistent.
"""

from backend.core.database import engine, SessionLocal, Base, get_db  # noqa: F401
