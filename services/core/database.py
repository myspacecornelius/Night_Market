"""Compatibility shim.

The engine, session factory and ``get_db`` dependency live in
``services.database``. This module used to build a second engine with its own
connection pool, so a request could end up with the current user loaded in one
session and the handler writing through another.
"""
from services.database import SessionLocal, engine, get_db

__all__ = ["SessionLocal", "engine", "get_db"]
