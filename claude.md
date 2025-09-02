# Dharma – Improvements, Expansions, and Testing Guide

This note collects quick wins and next steps for Claude to iterate on. Focus areas: Drop Zones, Heat Map, and LACES tokens, plus validation workflows and test scaffolding.

## Architecture Snapshots
- Backend: FastAPI + SQLAlchemy + Alembic, Pydantic v2, Redis.
- Workers: Celery (Redis broker/result), periodic jobs via beat.
- DB: Postgres + PostGIS (extension enabled).
- Frontend: React + Vite + Tailwind, Vitest + JSDOM.
- Observability: `/metrics` Prometheus endpoint, compose targets for Prometheus/Grafana.

## Verified Runtime
- `docker compose up` brings up postgres/redis → migrate → seed → api/worker/beat/frontend.
- Health: API, worker, and beat report healthy; `/health` returns status ok.

---

## Feature Quick Wins

### 1) Heat Map
- Data: aggregate posts and check-ins by geohash (e.g., precision 6–7) with time buckets (hour and day). Store in Redis with TTL 5–10 minutes; rebuild on write.
- API: `GET /v1/heatmap?bbox=&zoom=&window=24h` returns per-bin counts, top tags, sample posts.
- Worker: scheduled task every 5 min to refresh hot tiles; on post-create enqueue localized recompute.
- UX: map overlay with intensity slider; “Now / 24h / 7d” quick filters; tap hotspot → preview of top 3 posts.
- Testing: DB seed adds clustered locations; golden snapshot for API response shape; contract tests for bbox filtering and rollups.

### 2) Drop Zones
- Data: zones table (id, name, owner_id, polygon/center+radius, active windows, rules, moderators). Members table for RSVPs and roles.
- API:
  - `POST /v1/dropzones` (create; rate-limited; mod quorum optional)
  - `GET /v1/dropzones?bbox=&active=true`
  - `POST /v1/dropzones/{id}/checkin` (proximity check: haversine ≤ radius)
- Worker: periodic “zone status” job to open/close windows, publish system alerts.
- UX: map-first list + detail drawer; one-tap check-in; live count + streak boosts; zone chat link.
- Testing: geofence proximity unit tests; E2E API for create/list/checkin; abuse cases (rapid check-ins, spoofed distance).

### 3) LACES Tokens (off-chain points)
- Data: `laces_ledger` (user_id, amount, type, related_post_id, created_at). `users.laces_balance` maintained by triggers or service.
- Earn rules: daily stipend, helpful boosts, signal rewards, meetup confirmations; penalties for spam.
- API:
  - `GET /v1/laces/balance`
  - `GET /v1/laces/ledger?limit=100`
  - `POST /v1/laces/grant` (admin/task-only)
- Worker: daily stipend and decay; fraud checks (burst boosts, sockpuppet correlation).
- UX: wallet drawer with balance history, streaks, tiers; contextual earn hints; “soft stake” tokens for Swap/RSVP priority.
- Testing: idempotent stipend; invariant tests balance == sum(ledger); property tests for anti-abuse thresholds.

### 4) ThriftRoutes (nice-to-have, later)
- Route planner across curated POIs with best-time scores. Keep as backlog until Heat/Drop/LACES stabilize.

### 5) Swap Map (nice-to-have, later)
- Listings (offer/want), trust score, chat. Uses LACES as soft commitment.

---

## Backend Tasks for Claude
- Migrations:
  - Ensure `CREATE EXTENSION IF NOT EXISTS postgis` at migration start (or bootstrap step); keep `locations` using `Geography(Point, 4326)`.
- API surfaces:
  - `/v1/heatmap` endpoints with geohash bucketing, bbox filter, and time windows.
  - `/v1/dropzones` CRUD + `checkin` with distance validation.
  - `/v1/laces` balance/ledger; background tasks for stipend and boosts.
- Worker jobs:
  - HeatMap refresher, DropZone window manager, LACES stipend.
- Security:
  - Move `SECRET_KEY` to settings; tighten OAuth scopes for admin-only grants.

## Frontend Tasks for Claude
- Map layers: toggle HeatMap; zone boundaries with active state; pin clustering.
- Wallet UI: LACES balance chip + drawer; toast on earn events.
- Zone flows: create, share, check-in confirmation; presence count.
- Testing: Vitest + Testing Library for pages/components; fake timers for streaks; map mocks (stub mapbox/gl to avoid real WebGL).

## Testing Plan
- Unit: geospatial utils (geohash, distance), LACES ledger math, rate limits.
- API: contract tests for heatmap/dropzones/laces; seed fixtures; 429/403/401 behaviors.
- Worker: schedule smoke tests; use Redis in-memory in CI or ephemeral container.
- Load: k6 script for hotspot tiles and check-ins; verify p95 latency < 150ms for cached heat tiles.

## Observability
- Prometheus scrapes `/metrics` on API; suggest Celery metrics via `celery-prometheus-exporter` or pushgateway.
- Grafana panels: API RPS/latency, worker queue depth, LACES grants per day, active zones, heat tile cache hit rate.

## Rollout Plan
- Phase 1: HeatMap read-only + off-chain LACES ledger (daily stipend, boost rewards).
- Phase 2: Drop Zones with check-ins and presence counts.
- Phase 3: LACES staking for RSVP priority and Swap Map pilot.

## Open Questions
- Abuse controls for location spoofing: device fingerprinting vs. lightweight server-side heuristics?
- Privacy defaults for location precision (snap to ~100–200m geohash for public views)?
- Reputation spillovers (moderator trust boosts; sybil resistance without heavy KYC)?

---

## Quick Commands
```
docker compose up -d postgres redis
docker compose run --rm migrate && docker compose run --rm seed
docker compose up -d api worker beat frontend
curl -s localhost:8000/health | jq
```

## Done Today
- Compose and healthchecks fixed; Celery path corrected; Alembic reads `DATABASE_URL`; PostGIS enabled; Pydantic v2 configs migrated; Vitest coverage added; Tailwind tokens aligned.

