# A base image with Node.js 20, as requested.
FROM mcr.microsoft.com/devcontainers/javascript-node:0-20

# Install system dependencies for Python 3.11, Playwright, PostgreSQL client, and Redis client.
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    python3.11 \
    python3-pip \
    python3.11-venv \
    postgresql-client \
    redis-tools \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright's browser dependencies.
RUN npx playwright install-deps

# Set python3.11 as the default python interpreter.
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1
