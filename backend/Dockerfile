# Base Image
FROM python:3.11-slim

# Set Environment Variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH=/app

# Set Work Directory
WORKDIR /app

# Install System Dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python Dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Application Code
COPY backend/ /app/backend/

# Expose Port and Run Application
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
# --- Safe entrypoint with optional migration lock ---
ENV RUN_MIGRATIONS=false
RUN printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -euo pipefail' \
    'LOCKFILE="/tmp/migrate.lock"' \
    'if [ "${RUN_MIGRATIONS}" = "true" ]; then' \
    '  exec 9>"${LOCKFILE}"' \
    '  if flock -n 9; then' \
    '    echo "[entrypoint] alembic upgrade head (locked)";' \
    '    alembic upgrade head;' \
    '  else' \
    '    echo "[entrypoint] migration lock held; skipping";' \
    '  fi' \
    'fi' \
    'exec uvicorn backend.main:app --host 0.0.0.0 --port 8000' \
    > /entrypoint.sh && chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
