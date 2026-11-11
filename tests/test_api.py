"""End-to-end API tests against a migrated Postgres/PostGIS database."""
import uuid

PASSWORD = "Sup3r-Secret-Pass!"


def test_register_login_and_me(client):
    registered = client.post(
        "/users/",
        json={"username": "night_owl", "email": "night_owl@example.com", "display_name": "Night Owl", "password": PASSWORD},
    )
    assert registered.status_code == 200

    login = client.post("/auth/token", data={"username": "night_owl", "password": PASSWORD})
    assert login.status_code == 200
    tokens = login.json()
    assert tokens["refresh_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == "night_owl"

    wrong_password = client.post("/auth/token", data={"username": "night_owl", "password": "nope"})
    assert wrong_password.status_code == 401


def test_weak_passwords_are_rejected(client):
    response = client.post(
        "/users/",
        json={"username": "weak", "email": "weak@example.com", "display_name": "Weak", "password": "short"},
    )
    assert response.status_code == 400


def test_user_listing_requires_authentication(client, make_user, auth_headers):
    user = make_user()

    assert client.get("/users/").status_code == 401
    assert client.get("/users/", headers=auth_headers(user)).status_code == 200
    assert client.get("/users/?limit=100000", headers=auth_headers(user)).status_code == 422


def test_uploads_presign_requires_authentication(client):
    response = client.post("/uploads/presign", params={"file_name": "a.png", "file_type": "image/png"})
    assert response.status_code == 401


def test_release_admin_routes_reject_regular_users(client, make_user, auth_headers):
    user = make_user()

    response = client.delete("/releases/00000000-0000-0000-0000-000000000000", headers=auth_headers(user))

    assert response.status_code == 403


def test_checkout_task_cost_must_be_positive(client, make_user, auth_headers):
    user = make_user(laces_balance=100)
    payload = {
        "product_url": "https://example.com/products/x",
        "variant_id": "1",
        "size": "10",
        "retailer": "shopify",
        "mode": "request",
        "profile_id": "p1",
        "cost": -500,
    }

    response = client.post("/v1/shop/purchase-checkout-task", json=payload, headers=auth_headers(user))

    assert response.status_code == 422
    assert user.laces_balance == 100


def test_post_create_and_feed(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    created = client.post(
        "/posts/", json={"post_type": "GENERAL", "content_text": "hello night market"}, headers=headers
    )
    assert created.status_code == 200

    feed = client.get("/posts/feed", headers=headers)
    assert feed.status_code == 200
    assert any(post["post_id"] == created.json()["post_id"] for post in feed.json())


def test_dropzone_create_and_check_in(client, make_user, auth_headers):
    owner = make_user()
    headers = auth_headers(owner)

    assert client.post("/v1/dropzones", json={"name": "x", "center_lat": 0, "center_lng": 0}).status_code == 401

    created = client.post(
        "/v1/dropzones", json={"name": "Newbury St", "center_lat": 42.36, "center_lng": -71.06}, headers=headers
    )
    assert created.status_code == 200
    zone = created.json()
    assert zone["owner_id"] == str(owner.user_id)
    assert (zone["center_lat"], zone["center_lng"]) == (42.36, -71.06)

    far = client.post(f"/v1/dropzones/{zone['id']}/checkin", json={"lat": 40.71, "lng": -74.0}, headers=headers)
    assert far.status_code == 400

    near = client.post(f"/v1/dropzones/{zone['id']}/checkin", json={"lat": 42.3601, "lng": -71.0601}, headers=headers)
    assert near.status_code == 200
    assert near.json()["distance_from_center"] < 50

    again = client.post(f"/v1/dropzones/{zone['id']}/checkin", json={"lat": 42.3601, "lng": -71.0601}, headers=headers)
    assert again.status_code == 400


def test_signal_shows_up_in_heatmap(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    signal = client.post(
        "/v1/hyperlocal/signals",
        json={"content_text": "restock on the wall", "geo_tag_lat": 42.36, "geo_tag_long": -71.06},
        headers=headers,
    )
    assert signal.status_code == 200

    # The response is cached in Redis by bbox; a unique one avoids a stale hit.
    bbox = f"-71.2,42.2,-70.9,42.5{uuid.uuid4().int % 100000:05d}"
    heatmap = client.get(f"/v1/heatmap?bbox={bbox}&window=1h", headers=headers)
    assert heatmap.status_code == 200
    bins = heatmap.json()["bins"]
    assert bins
    assert all(isinstance(b["lat"], float) and isinstance(b["lng"], float) for b in bins)


def test_admin_check_ignores_an_unset_admin_list(client, db_session, make_user, auth_headers, monkeypatch):
    monkeypatch.delenv("ADMIN_USERS", raising=False)
    user = make_user()
    user.username = ""  # an unset ADMIN_USERS used to split to [""] and match this
    db_session.commit()

    response = client.delete("/releases/00000000-0000-0000-0000-000000000000", headers=auth_headers(user))

    assert response.status_code == 403


def test_registration_validates_the_username(client):
    def register(username):
        return client.post(
            "/users/",
            json={"username": username, "email": "x@example.com", "display_name": "X", "password": PASSWORD},
        )

    assert register("").status_code == 422
    assert register("a b").status_code == 422
    assert register("x" * 51).status_code == 422


def test_readiness_reports_dependencies(client, monkeypatch):
    ready = client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"] == {"database": True, "redis": True}

    from services import main

    monkeypatch.setattr(main, "db_healthcheck", lambda: False)
    degraded = client.get("/health/ready")
    assert degraded.status_code == 503
    assert degraded.json()["checks"]["database"] is False


def test_unexpected_constraint_and_type_errors_are_not_500s(client, db_session):
    from fastapi import APIRouter
    from sqlalchemy import text

    from services.main import app

    probe = APIRouter()

    @probe.get("/_probe/integrity")
    def integrity():
        db_session.execute(text("INSERT INTO users (user_id) VALUES (gen_random_uuid())"))

    @probe.get("/_probe/data")
    def data():
        db_session.execute(text("SELECT 'not-a-uuid'::uuid"))

    app.include_router(probe)
    try:
        assert client.get("/_probe/integrity").status_code == 409
        db_session.rollback()
        assert client.get("/_probe/data").status_code == 422
        db_session.rollback()
    finally:
        app.router.routes[:] = [route for route in app.router.routes if not getattr(route, "path", "").startswith("/_probe/")]


def test_metrics_count_requests_by_route_template(client, make_user, auth_headers):
    import uuid

    headers = auth_headers(make_user())
    zone_id = uuid.uuid4()
    assert client.get(f"/v1/dropzones/{zone_id}").status_code == 404
    assert client.get("/no/such/path").status_code == 404
    assert client.post("/v1/laces/daily-stipend", headers=headers).status_code == 200

    metrics = client.get("/metrics/").text

    assert 'http_requests_total{method="GET",route="/v1/dropzones/{dropzone_id}",status="404"}' in metrics
    assert 'route="unmatched"' in metrics
    assert str(zone_id) not in metrics  # raw paths would create one series per id
    assert 'http_request_duration_seconds_bucket{le="0.5",method="GET",route="/v1/dropzones/{dropzone_id}"}' in metrics
    assert 'laces_ledger_entries_total{transaction_type="DAILY_STIPEND"}' in metrics
    assert 'laces_amount_total{direction="credit",transaction_type="DAILY_STIPEND"}' in metrics


def test_startup_warmup_queues_one_task_off_the_event_loop(monkeypatch):
    """Queueing a Celery task is a blocking Redis call. With the broker unreachable it
    took about 19 seconds, and the API served nothing meanwhile. It also queued the
    task four times with a filter that matched no cache key."""
    import asyncio
    import time

    from services import main
    from worker import tasks

    calls = []

    def slow_delay(*args, **kwargs):
        calls.append((args, kwargs))
        time.sleep(0.3)  # a broker that is slow to answer

    monkeypatch.setattr(tasks.refresh_heatmap_cache, "delay", slow_delay)

    async def scenario():
        ticks = 0

        async def ticker():
            nonlocal ticks
            while True:
                await asyncio.sleep(0.02)
                ticks += 1

        running = asyncio.create_task(ticker())
        await main._warm_critical_caches()
        running.cancel()
        return ticks

    ticks = asyncio.run(scenario())

    assert calls == [((), {})]  # once, for everything
    assert ticks >= 5, "the event loop was blocked while the task was being queued"


def test_async_route_handlers_really_await():
    """A handler declared `async def` runs on the event loop. If all it does is make
    blocking database calls, every other request on that worker waits for it, and one
    that waits for a row lock can stall the worker for good. Such handlers are `def`."""
    import inspect

    from services.main import app

    offenders = []
    for route in app.routes:
        endpoint = getattr(route, "endpoint", None)
        if endpoint is None or not inspect.iscoroutinefunction(endpoint):
            continue
        if not endpoint.__module__.startswith("services."):
            continue  # the framework's own documentation routes
        source = inspect.getsource(endpoint)
        if not any(word in source for word in ("await ", "async for", "async with")):
            offenders.append(f"{endpoint.__module__}.{endpoint.__name__}")

    assert not offenders, f"async handlers that never await: {offenders}"


def test_request_log_lines_say_what_happened(client, caplog):
    """The request log passed its details as logging "extra" fields, which the
    configured format does not print: every line read just "request_complete"."""
    import logging

    with caplog.at_level(logging.INFO, logger="dharma.tracing"):
        response = client.get("/health")

    line = next(record.getMessage() for record in caplog.records if record.name == "dharma.tracing")
    assert "GET" in line and "/health" in line and "200" in line
    assert response.headers["X-Request-ID"] in line
