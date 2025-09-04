#!/bin/bash

# Run alembic migrations
cd /app/backend
alembic upgrade head

# Start the FastAPI application
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
