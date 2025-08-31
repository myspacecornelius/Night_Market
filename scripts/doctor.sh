#!/bin/bash
set -e

echo "🩺 Running Dharma Doctor..."
echo ""

# Check 1: Docker daemon
echo -n "1. Checking Docker daemon... "
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker daemon is not running."
    exit 1
else
    echo "✅ Docker is running."
fi

# Check 2: Docker Compose services
echo -n "2. Checking Docker Compose services (postgres, redis)... "
if ! docker compose ps | grep -q "postgres.*Up"; then
    echo "❌ Postgres container is not running."
    exit 1
fi
if ! docker compose ps | grep -q "redis.*Up"; then
    echo "❌ Redis container is not running."
    exit 1
else
    echo "✅ Postgres and Redis are running."
fi

# Check 3: Database connectivity and migrations
echo -n "3. Checking database connection and migrations... "
if ! docker compose run --rm api bash -lc 'alembic -c backend/alembic.ini current' | grep -q "(head)"; then
    echo "❌ Database not reachable or not up to date."
    exit 1
else
    echo "✅ Database is connected and migrations are up to date."
fi

# Check 4: Python imports
echo -n "4. Checking Python imports... "
if ! python -c "import sys; sys.path.append('.'); import services" > /dev/null 2>&1; then
    echo "❌ Python imports are failing."
    exit 1
else
    echo "✅ Python imports are working."
fi

echo ""
echo "✅ All checks passed! Your environment is healthy."
exit 0
