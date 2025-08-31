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

# Create the backend .env file
cat << EOF > backend/.env
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
ENVIRONMENT=${ENVIRONMENT}
GEMINI_API_KEY=${GEMINI_API_KEY}
EOF

echo ".env files for frontend and backend have been created successfully."
