#!/bin/bash

set -e

# Check if the root .env file exists
if [ ! -f ".env" ]; then
  echo "Root .env file not found. Please create one from .env.example."
  exit 1
fi

# Load the root .env file
export $(grep -v '^#' .env | xargs)

# Create the frontend .env file
cat << EOF > frontend/.env
VITE_API_URL=${VITE_API_URL}
VITE_WS_URL=${VITE_WS_URL}
VITE_ENV=${VITE_ENV}
EOF

# The root .env is left as-is: rewriting it here dropped JWT_SECRET_KEY and the
# *_HOST/*_PORT values that DATABASE_URL and REDIS_URL are built from.

echo "frontend/.env has been created successfully."
