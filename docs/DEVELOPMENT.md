# Dharma / SneakerSniper – Development Guide

This guide covers local setup, environments, running stacks, testing, observability, and common workflows for both the Dharma app and the SneakerSniper microservices.

## Prerequisites
- Docker Desktop (recommended) or Docker Engine + Compose
- Make (optional, for shortcuts)
- Node.js 20.x (for frontend dev outside Docker)
- Python 3.11 (optional, for local runs of backend/worker)

## Repository Structure (high‑level)
- `backend/`: Dharma FastAPI app (API, models, alembic, core)
- `frontend/`: React + Vite app
- `worker/`: Celery worker + beat (background tasks)
- `services/`: SneakerSniper microservices (api gateway, monitor, checkout, proxy)
- `infra/`: Prometheus/Grafana configs
- `docker-compose.yml`: Main Dharma stack
- `docker-compose.services.yml`: Microservices stack

## Environment Setup
1) Copy environment file

```
cp .env.example .env
```

2) Adjust key env variables (in `.env`):
- `DATABASE_URL`: Postgres connection (PostGIS enabled in Docker compose)
- `REDIS_URL`: Redis connection (defaults to `redis://redis:6379/0` when using Docker)
- `API_PORT`, `FRONTEND_PORT`: ports for API and frontend
- `JWT_SECRET_KEY`: change for non‑dev usage
- `AUTO_SEED_DATA=true`: controls demo data seeding

Microservices-specific (set via compose or export before running):
- `REDIS_URL`: `redis://redis:6379/0` (microservices compose)
- Checkout service: `ENCRYPTION_KEY` (Fernet key; demo set in `docker-compose.services.yml`)
- Monitor service (MySQL): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

## Stacks Overview
- Dharma stack (monolith): Postgres+PostGIS, Redis, FastAPI backend, Celery worker + beat, React frontend, Prometheus, Grafana.
- Microservices stack: API Gateway (FastAPI), Monitor (stock polling), Checkout (request/browser modes), Proxy Manager, Prometheus (for microservices), optional Postgres + MySQL for specialized storage.

## Quick Start (Dharma)
```
make setup
make up
```
Endpoints:
- Frontend: `http://localhost:5173`
- API: `http://localhost:8000` (docs `/docs`, health `/health`, metrics `/metrics`)
- Grafana: `http://localhost:3000` (admin/admin)
- Prometheus: `http://localhost:9090`

Helpful commands:
- `make logs` – follow all service logs
- `make status` – show container status
- `make down` – stop services
- `make migrate` – run alembic migrations inside API container
- `make seed` – populate demo data

## Quick Start (Microservices)
Bring up the SneakerSniper services in parallel to Dharma:
```
docker compose -f docker-compose.services.yml up -d --build
```
Endpoints:
- Micro API Gateway metrics: `http://localhost:8001/metrics`
- Proxy metrics: `http://localhost:8002/metrics`
- Micro Prometheus: `http://localhost:9091`

Notes:
- Microservices use a separate `redis` and `mysql` within the same compose file (network `servicesnet`).
- Replace the demo `ENCRYPTION_KEY` in `docker-compose.services.yml` for any real usage.

## Database & Migrations
Dharma backend uses SQLAlchemy + Alembic with Postgres+PostGIS.

- Apply migrations (auto‑run via compose `migrate` service on first startup):
```
docker compose exec api alembic upgrade head
```
- Create a new migration (from inside `backend/`):
```
docker compose exec api alembic revision --autogenerate -m "desc"
```

## Seeding Demo Data
If `AUTO_SEED_DATA=true`, seeding runs automatically after migrations via the `seed` service. To run manually:
```
docker compose exec api python -m backend.seed
```

## Testing
- Backend (pytest):
```
# inside container
docker compose exec api pytest -q
```

- Frontend (vitest):
```
cd frontend
npm ci
npm test -- --watchAll=false
```

- Worker tasks: unit tests live under `worker/` (if present). Run similarly with pytest.

- CI: GitHub Actions runs lint, tests, security scans. See `.github/workflows/`.

## Linting & Formatting
- Python (ruff):
```
ruff check .
ruff format .
```
- Frontend:
```
cd frontend
npm run lint
```

## Observability
Prometheus scrapes metrics, Grafana visualizes dashboards.

- Dharma Prometheus: `localhost:9090`
- Microservices Prometheus: `localhost:9091`
- Grafana: `localhost:3000`

Prometheus configs:
- Dharma: `infra/prometheus.yml`
- Microservices: `infra/prometheus.services.yml`

Wiring microservice metrics into the main Prometheus:
- Main Prometheus (`infra/prometheus.yml`) scrapes microservices via published host ports using `host.docker.internal` (Docker Desktop). If on Linux, replace with your Docker bridge gateway (often `172.17.0.1`) or add an `extra_hosts` entry to Prometheus service in `docker-compose.yml`.

## Redis Tips
Connect to Redis inside the Dharma network:
```
docker compose exec redis redis-cli
```
Useful keys/channels:
- `active_monitors`, `monitor_updates`, `system_alerts`
- `checkout_queue`, `task_updates`
- `metrics:*` – assorted counters and gauges

## Common Workflows
- Create Hyperlocal Signal via Dharma API:
  - Auth as needed, then POST to `/v1/signals` with `PostCreate` body.
- Get Hyperlocal Feed:
  - GET `/v1/feed/scan?latitude=..&longitude=..&radius=..`
- Start Monitor (Microservices API Gateway):
  - POST `/api/monitors` with JSON `{ sku, retailer, interval_ms, ... }`
- Queue Checkout Tasks:
  - POST `/api/checkout/tasks/batch` with profiles/payments

## Example cURL Requests

Auth/session (Dharma backend):
```
curl -sX POST http://localhost:8000/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"secret"}'
```

Health and metrics (Dharma):
```
curl -s http://localhost:8000/health
curl -s http://localhost:8000/metrics | head
```

Create hyperlocal signal (Dharma):
```
TOKEN="$(your_token_here)"
curl -sX POST 'http://localhost:8000/v1/signals' \
  -H 'Authorization: Bearer '"$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "post_type":"GENERAL",
    "content_text":"Line moving at Concepts",
    "tags":["boston","jordan"],
    "geo_tag_lat":42.362,
    "geo_tag_long":-71.057,
    "visibility":"public"
  }'
```

Scan hyperlocal feed (Dharma):
```
curl -s 'http://localhost:8000/v1/feed/scan?latitude=42.36&longitude=-71.06&radius=1.0' \
  -H 'Authorization: Bearer '"$TOKEN"
```

Create session (Microservices API Gateway):
```
curl -sX POST http://localhost:8001/api/auth/session \
  -H 'Content-Type: application/json' \
  -d '{"api_key":"dev-api-key-123","device_id":"dev-machine"}'
```

Create a monitor (Microservices API Gateway):
```
TOKEN_MS="$(your_micro_token_here)"
curl -sX POST http://localhost:8001/api/monitors \
  -H 'Authorization: Bearer '"$TOKEN_MS" \
  -H 'Content-Type: application/json' \
  -d '{
    "sku":"FD6475-001",
    "retailer":"shopify",
    "interval_ms":200,
    "keywords":["jordan","travis"]
  }'
```

Create checkout task batch (Microservices API Gateway):
```
curl -sX POST http://localhost:8001/api/checkout/tasks/batch \
  -H 'Authorization: Bearer '"$TOKEN_MS" \
  -H 'Content-Type: application/json' \
  -d '{
    "count": 3,
    "monitor_id": "YOUR_MONITOR_ID",
    "profile_ids": ["profile-1","profile-2","profile-3"],
    "payment_ids": ["payment-1","payment-2","payment-3"],
    "mode": "request",
    "stagger_ms": 100
  }'
```

Metrics (Microservices):
```
curl -s http://localhost:8001/metrics | head    # API Gateway
curl -s http://localhost:8002/metrics | head    # Proxy metrics
```

## Data Flow (high level)
```
Frontend → Dharma API → Postgres + Redis
Dharma API ⇄ Celery Worker via Redis
Micro API ⇄ Redis ⇄ Monitor / Checkout / Proxy
Prometheus → scrape /metrics (API, Proxy)
Grafana → visualizes
```

## Troubleshooting
- Docker daemon not running: start Docker Desktop.
- Port conflicts: adjust `API_PORT`, `FRONTEND_PORT`, or exposed compose ports.
- PostGIS errors: image `postgis/postgis` in compose manages extensions.
- MySQL health (monitor service): check logs for `mysql` in `docker-compose.services.yml`.
- Redis connectivity: ensure `REDIS_URL` matches service DNS (e.g., `redis://redis:6379/0`).
- Encryption key missing (checkout): set `ENCRYPTION_KEY` (Fernet key) before starting service.

## Security Notes
- Never commit real secrets to `.env`.
- Rotate JWT secret/ENCRYPTION_KEY for non‑dev.
- Use separate DBs/Redis for production and restrict ports with firewalls.

## Where to Look Next
- `README.md`: project overview
- `Makefile`: common commands
- `backend/api/*`: Dharma API routes
- `services/*`: microservices code
- `.github/workflows/*`: CI pipelines

---
Happy building! If you want, we can add scripts for one‑shot local smoke tests and seed routines, or provision Grafana dashboards for microservices.
