1) Auth, Identity, & Privacy Guardrails

Why
Everything else depends on trusted users + “privacy by design.”

Build
	•	JWT auth with rotation + refresh; email/password + OAuth (Discord optional).
	•	Minimal profiles: handle, home_city, privacy_level (public / pseudonymous / anon).
	•	Rate limiting & IP/device fingerprinting (fail2ban-style table, no 3rd-party vendor).

Accepts
Create account → log in/out → rotate tokens → per-route rate limits enforced.

⸻

2) Geospatial “Signals” Pipeline (Product Heartbeat)

Why
Heatmap + feed + tokens depend on a clean location event.

Build
	•	PostGIS models:
signal(id, user_id, geom POINT, text, media_url?, signal_type, store_id?, drop_id?, reputation_score, created_at) with GIST index.
	•	Celery tasks: geohash bucket aggregation; dedupe (same user + geohash + window); spam heuristics.
	•	REST:
POST /signals, GET /signals?bbox|city|drop_id, GET /heatmap?zoom=N.

Accepts
500 seeded signals render on map & feed in < 200ms p95 (local); dedupe drops < 10%.

⸻

3) “Drops” Canonical Source & Calendar

Why
UI promises “Upcoming Drops.” Seeded first, then live.

Build
	•	Models:
drop(id, brand, sku, name, release_at, stores[], regions[], links[], status)
store(id, name, slug, geom, open_hours, retailer_type)
	•	Admin JSON import + basic scraper interface (Night_Market workers later).
	•	REST:
GET /drops?from=…&to=…&city=…, GET /stores?near=….

Accepts
Demo cities (BOS/NYC/LA/CHI) show 2–4 weeks of drops; store pins cluster correctly.

⸻

4) LACES (Off-Chain) Ledger v1

Why
Reward loop without blockchain complexity.

Build
	•	laces_tx(id, user_id, amount, reason ENUM{signal, legit_check, bug_fix, content}, ref_id, created_at); running balance materialized view.
	•	Earning rules table; award via Celery on approved actions.
	•	Profile badge levels from thresholds.

Accepts
Posting a first valid signal → +N LACES; leaderboard endpoint returns top 20 per city.

⸻

5) Moderation & Community Safety MVP

Why
“No backdoors” + trust.

Build
	•	mod_flag(entity_type, entity_id, reason, reporter_id); admin review endpoints.
	•	Heuristics: velocity caps, near-duplicate text, link reputation.
	•	Soft-delete with audit trail.

Accepts
Flag → review queue → resolve; abusive rate patterns throttled automatically.

⸻

6) DevEx & Reliability Rails

Why
Lower friction = higher velocity.

Build
	•	make doctor verifies Docker, ports, env; make seed idempotent demo load.
	•	Health checks: /health, /ready; Prometheus exporters for API, worker, Postgres.
	•	CI: lint (ruff/black), typecheck (mypy/pyright), tests (pytest) on PR.

Accepts
Fresh clone → make setup && make up → app green; PR must pass CI gates.

⸻

P1 — Make It Sticky & Defensible (2–4 sprints)

7) Reputation Graph & Anti-Sybil

Why
Signal quality > signal volume.

Build
	•	reputation_events (upvotes, accurate drop edits, verified store check-ins).
	•	Weighted trust score per user (time-decay + diversity of actions).
	•	Downweight low-trust signals across feeds/heatmap.

Accepts
New burner accounts can’t meaningfully move heatmap without time + diversity.

⸻

8) Night_Market Integration: Ingestion Workers

Why
Turn the underground into structured data.

Build
	•	Worker adapters: SNKRS entries, Shopify/Queue-it status, raffle pages → normalize to drop_status_event.
	•	Backoff, circuit breaker, per-source EULA compliance flags.

Accepts
≥ 3 sources feeding drop_status_event; events stored on each drop’s timeline.

⸻

9) Community Legit Checks & Q&A Threads

Why
Utility beyond “did it drop?”

Build
	•	Threaded comments on signals/drops; “mark helpful” awards LACES.
	•	Media upload (pre-signed URLs) with server-side EXIF stripping by default.

Accepts
Photo legit check → two helpful votes → author gets LACES; EXIF removed.

⸻

10) Observability You’ll Actually Use

Why
Grafana/Prometheus are listed—make dashboards opinionated.

Build Dashboards
	•	User Funnel: signups → first signal → week-2 retention.
	•	Geo Health: signals per geohash, unique users per city.
	•	Quality: % deduped, moderation action rate, false-positive review rate.
	•	Perf: p50/p95/p99 per endpoint, worker queue latency.

Accepts
Single Grafana home links to these 4 dashboards; SLO alerts to Discord webhook.

⸻

11) Notifications & Weekly City Brief

Why
Bring users back.

Build
	•	Email + Discord bot MVP: “Top 5 signals near you,” “This week’s drops in Boston.”
	•	User prefs: opt-in cadence & channels.

Accepts
Scheduled Celery beat job sends a Boston brief to seed users.

⸻

P2 — Step-Change Features (Plan Now)

12) On-Device Privacy & Coarse-Graining
	•	Default to geohash-5 submissions; optional high-precision with one-time consent.
	•	Differential privacy noise for public heatmap; store raw only for trust-scoring.

13) Governance Lite
	•	City-level proposals (e.g., earning rules) gated by reputation tiers; 1-week voting windows; audit log.

14) LACES v2: Withdrawal & Partners
	•	Off-chain → on-chain bridge later; start with partner rewards: raffles, early access, Discord role badges.

15) Map UX Polish
	•	Server-side clustering (PostGIS ST_ClusterDBSCAN) → stable pins.
	•	“Activity lanes” (time slider), store detail sheets with live status.

⸻

Concrete Issue Templates (Paste into GitHub)
	•	feat(api): Signals model + endpoints
Accepts: create/list/filter; PostGIS GIST; GeoJSON output; 200ms p95 local.
	•	feat(worker): geohash aggregation & dedupe
Accepts: hourly aggregates stored; dedupe < 10%; metrics exported.
	•	feat(drops): admin import & calendar API
Accepts: JSON import; GET /drops filters; seed 4 cities.
	•	feat(auth): JWT rotation + rate limiting
Accepts: access/refresh flow; Redis-backed limiter; brute-force lockout.
	•	feat(laces): off-chain ledger & leaderboard
Accepts: earn on first valid signal; per-city leaderboard endpoint.
	•	feat(moderation): flag → review → resolve
Accepts: admin role routes; audit log; soft-delete.
	•	ops: make doctor & CI gates
Accepts: local env check; ruff/black/mypy/pytest in GH Actions.

⸻

Data Model Sketch (Tables)

users, profiles, sessions
signals(POINT, text, type, store_id?, drop_id?, rep_score)
drops, stores(POINT), drop_status_event
laces_tx, reputation_events
comments, mod_flags, media_assets

Indexes: GIST on geom; BTREE on (city, created_at); partial index on active drops.

⸻

Security & Compliance Musts (Do Now)
	•	Strip EXIF on upload; content-hash to detect reposts.
	•	CORS allowlist; strong CSP headers on frontend.
	•	Secrets via .env + Docker secrets; never baked into images.
	•	Audit trail for admin actions; downloadable user data export (“privacy by design”).

⸻

Tests That Matter
	•	Property tests for dedupe & geohash bucketing.
	•	Load test: 50 req/s POST /signals with p95 < 250ms.
	•	Auth fuzzing (expired/forged tokens).
	•	E2E: seed → submit signal → earn LACES → appears on heatmap/feed → included in weekly brief.

⸻

What Not to Build Yet
	•	On-chain tokens, market makers, exchangeability.
	•	Real-time websockets fan-out (polling is fine for v1).
	•	Fancy ML moderation (start with heuristics + human review).
	•	Over-abstracted microservices (keep one repo, one compose).

_____