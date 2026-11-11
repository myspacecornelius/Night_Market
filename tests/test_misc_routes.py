"""Releases, subscriptions, upload presigning, rate limiting and the placeholder endpoints."""
import base64
import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from services.models.release import Release
from services.models.subscription import Subscription

RELEASE = {
    "sneaker_name": "Air Max 1",
    "brand": "Nike",
    "release_date": "2031-03-26T10:00:00Z",
    "retail_price": "200.00",
    "store_links": {"nike": "https://example.com/air-max-1"},
}


def _release(db_session, **overrides):
    values = {
        "sneaker_name": "Air Max 1",
        "brand": "Nike",
        "release_date": datetime.now(timezone.utc) + timedelta(days=7),
        "retail_price": Decimal("200.00"),
        "store_links": {"nike": "https://example.com/air-max-1"},
    }
    values.update(overrides)
    release = Release(**values)
    db_session.add(release)
    db_session.commit()
    return release


# --- releases ---------------------------------------------------------------------


def test_release_patch_changes_only_the_fields_sent(client, db_session, make_user, auth_headers):
    admin = auth_headers(make_user(is_admin=True))
    release = _release(db_session)

    patched = client.patch(f"/releases/{release.release_id}", json={"retail_price": "250.50"}, headers=admin)

    assert patched.status_code == 200, patched.text  # used to be a 422: every field was required
    body = patched.json()
    assert body["retail_price"] == "250.50"
    assert (body["sneaker_name"], body["brand"]) == ("Air Max 1", "Nike")
    assert body["store_links"] == {"nike": "https://example.com/air-max-1"}

    renamed = client.patch(f"/releases/{release.release_id}", json={"sneaker_name": "Air Max 1 '86"}, headers=admin)
    assert renamed.status_code == 200
    assert (renamed.json()["sneaker_name"], renamed.json()["retail_price"]) == ("Air Max 1 '86", "250.50")

    untouched = client.patch(f"/releases/{release.release_id}", json={}, headers=admin)
    assert untouched.status_code == 200
    assert untouched.json()["sneaker_name"] == "Air Max 1 '86"


def test_release_patch_applies_falsy_values(client, db_session, make_user, auth_headers):
    admin = auth_headers(make_user(is_admin=True))
    release = _release(db_session)
    url = f"/releases/{release.release_id}"

    # a full object whose new values are falsy used to come back unchanged with a 200
    full = client.patch(url, json={**RELEASE, "retail_price": "0", "store_links": None}, headers=admin)
    assert full.status_code == 200, full.text
    assert full.json()["retail_price"] == "0.00"
    assert full.json()["store_links"] is None

    emptied = client.patch(url, json={"store_links": {}}, headers=admin)
    assert emptied.status_code == 200
    assert emptied.json()["store_links"] == {}

    db_session.refresh(release)
    assert release.retail_price == 0 and release.store_links == {}


def test_release_patch_rejects_values_the_table_cannot_hold(client, db_session, make_user, auth_headers):
    admin = auth_headers(make_user(is_admin=True))
    release = _release(db_session)
    url = f"/releases/{release.release_id}"

    for bad in (
        {"sneaker_name": None},  # NOT NULL columns cannot be cleared
        {"brand": None},
        {"release_date": None},
        {"retail_price": None},
        {"retail_price": "-1"},
        {"retail_price": "123456789012.99"},
        {"release_date": "next tuesday"},
    ):
        response = client.patch(url, json=bad, headers=admin)
        assert response.status_code == 422, (bad, response.text)

    assert client.patch(f"/releases/{uuid.uuid4()}", json={"brand": "Asics"}, headers=admin).status_code == 404
    assert client.patch("/releases/not-a-uuid", json={"brand": "Asics"}, headers=admin).status_code == 422

    current = client.get(url).json()
    assert (current["sneaker_name"], current["brand"], current["retail_price"]) == ("Air Max 1", "Nike", "200.00")


def test_release_ids_must_be_uuids(client):
    malformed = client.get("/releases/not-a-uuid")

    assert malformed.status_code == 422
    assert malformed.json()["detail"][0]["loc"] == ["path", "release_id"]  # refused before any query runs
    assert client.get(f"/releases/{uuid.uuid4()}").status_code == 404


def test_release_prices_are_validated_before_they_reach_the_database(client, db_session, make_user, auth_headers):
    admin = auth_headers(make_user(is_admin=True))

    def create(price):
        return client.post("/releases/", json={**RELEASE, "retail_price": price}, headers=admin)

    # too many digits for numeric(10, 2), negative, more than two decimals, not a number
    for bad in ("123456789012.99", 123456789012.99, "999999999", "100000000", "-5", -0.01, "1.999", "NaN", "Infinity"):
        response = create(bad)
        assert response.status_code == 422, (bad, response.text)
        assert response.json()["detail"][0]["loc"] == ["body", "retail_price"], bad

    largest = create("99999999.99")
    assert largest.status_code == 200, largest.text
    assert largest.json()["retail_price"] == "99999999.99"
    assert create("0").json()["retail_price"] == "0.00"
    assert create(149.5).json()["retail_price"] == "149.50"

    # the rules are for new input: a row stored before them can still be read
    legacy = _release(db_session, sneaker_name="legacy", retail_price=Decimal("-5.00"))
    assert client.get(f"/releases/{legacy.release_id}").json()["retail_price"] == "-5.00"


def test_deleting_a_release_also_removes_its_subscriptions(client, db_session, make_user, auth_headers):
    admin = auth_headers(make_user(is_admin=True))
    fan, other_fan = make_user(), make_user()
    release = _release(db_session, sneaker_name="Cancelled")
    other_release = _release(db_session, sneaker_name="Still happening")

    def subscribe(user, **target):
        response = client.post("/subscriptions/", json=target, headers=auth_headers(user))
        assert response.status_code == 200, response.text
        return response.json()["subscription_id"]

    subscribe(fan, release_id=str(release.release_id))
    subscribe(other_fan, release_id=str(release.release_id), brand="Nike")
    kept = {subscribe(fan, release_id=str(other_release.release_id)), subscribe(fan, brand="Nike")}

    deleted = client.delete(f"/releases/{release.release_id}", headers=admin)

    assert deleted.status_code == 204, deleted.text  # used to fail on the foreign key
    assert client.get(f"/releases/{release.release_id}").status_code == 404
    assert db_session.query(Subscription).filter(Subscription.release_id == release.release_id).count() == 0
    mine = client.get("/subscriptions/my", headers=auth_headers(fan)).json()
    assert {subscription["subscription_id"] for subscription in mine} == kept
    assert client.get("/subscriptions/my", headers=auth_headers(other_fan)).json() == []
    assert client.get(f"/releases/{other_release.release_id}").status_code == 200

    assert client.delete(f"/releases/{release.release_id}", headers=admin).status_code == 404


def test_release_list_is_public_and_paginated(client, db_session):
    first_day = datetime(2031, 1, 1, tzinfo=timezone.utc)
    names = [f"listed-{index}" for index in range(5)]
    for index, name in enumerate(names):
        _release(db_session, sneaker_name=name, release_date=first_day + timedelta(days=index))

    everything = client.get("/releases/", params={"limit": 100})  # no Authorization header: the list is public

    assert everything.status_code == 200, everything.text
    listed = [release["sneaker_name"] for release in everything.json() if release["sneaker_name"].startswith("listed-")]
    assert listed == names[::-1]  # latest release date first
    assert {"release_id", "brand", "release_date", "retail_price", "store_links"} <= set(everything.json()[0])

    page = client.get("/releases/", params={"skip": 1, "limit": 2})
    assert page.status_code == 200
    assert page.json() == everything.json()[1:3]
    assert client.get("/releases/", params={"skip": 0, "limit": 50}).status_code == 200  # what the web client sends

    for bad in ({"limit": 0}, {"limit": 101}, {"limit": -1}, {"skip": -1}, {"skip": "abc"}, {"skip": 10**30}):
        assert client.get("/releases/", params=bad).status_code == 422, bad


def test_upcoming_releases_cover_the_next_ninety_days(client, db_session):
    now = datetime.now(timezone.utc)
    _release(db_session, sneaker_name="last week", release_date=now - timedelta(days=7))
    _release(db_session, sneaker_name="tomorrow", release_date=now + timedelta(days=1))
    _release(db_session, sneaker_name="next year", release_date=now + timedelta(days=365))

    def upcoming(**params):
        response = client.get("/releases/upcoming", params=params)
        assert response.status_code == 200, response.text
        return {release["sneaker_name"] for release in response.json()}

    assert {"last week", "tomorrow", "next year"} & upcoming() == {"tomorrow"}
    assert {"last week", "tomorrow", "next year"} & upcoming(from_date=(now + timedelta(days=300)).isoformat()) == {"next year"}
    # a start date at the end of the calendar used to overflow the default window (500)
    assert upcoming(from_date="9999-12-01T00:00:00Z") == set()


# --- subscriptions ----------------------------------------------------------------


def test_subscribing_to_an_unknown_release_is_a_404(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    response = client.post("/subscriptions/", json={"release_id": str(uuid.uuid4())}, headers=headers)

    assert response.status_code == 404  # used to be a foreign-key violation
    assert response.json()["detail"] == "Release not found"
    assert client.get("/subscriptions/my", headers=headers).json() == []


def test_a_subscription_needs_a_brand_or_a_release(client, db_session, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    release = _release(db_session)

    for empty in ({}, {"brand": None, "release_id": None}, {"brand": ""}, {"brand": "   "}):
        assert client.post("/subscriptions/", json=empty, headers=headers).status_code == 422, empty
    assert client.post("/subscriptions/", json={"release_id": "not-a-uuid"}, headers=headers).status_code == 422
    assert client.post("/subscriptions/", json={"brand": "x" * 101}, headers=headers).status_code == 422
    assert db_session.query(Subscription).filter(Subscription.user_id == user.user_id).count() == 0

    by_brand = client.post("/subscriptions/", json={"brand": "  New Balance "}, headers=headers)
    assert by_brand.status_code == 200, by_brand.text
    assert (by_brand.json()["brand"], by_brand.json()["release_id"]) == ("New Balance", None)

    by_release = client.post("/subscriptions/", json={"release_id": str(release.release_id)}, headers=headers)
    assert by_release.status_code == 200, by_release.text
    assert by_release.json()["release_id"] == str(release.release_id)
    assert by_release.json()["user_id"] == str(user.user_id)

    assert client.post("/subscriptions/", json={"brand": "Nike"}).status_code == 401


# --- uploads ----------------------------------------------------------------------

BUCKET = "night-market-test-uploads"


@pytest.fixture
def s3_settings(monkeypatch):
    """Dummy AWS settings. botocore signs a presigned POST locally, so nothing reaches AWS."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIATESTTESTTESTTEST")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "not-a-real-secret-access-key")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("S3_BUCKET", BUCKET)
    _only_environment_credentials(monkeypatch)


def _only_environment_credentials(monkeypatch):
    """Keep boto3 away from the developer's own profile and from the instance metadata service."""
    for name in ("AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_DEFAULT_PROFILE", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
                 "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", "/nonexistent/aws/credentials")
    monkeypatch.setenv("AWS_CONFIG_FILE", "/nonexistent/aws/config")


def _policy_conditions(presigned):
    return json.loads(base64.b64decode(presigned["fields"]["policy"]))["conditions"]


def test_presign_builds_the_object_key_from_the_caller(client, make_user, auth_headers, s3_settings):
    from services.core.s3 import MAX_UPLOAD_BYTES

    user = make_user()

    response = client.post(
        "/uploads/presign",
        params={"file_name": "../../other-user/avatar.png", "file_type": "image/png"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200, response.text
    presigned = response.json()
    assert BUCKET in presigned["url"] and "your-s3-bucket-name" not in presigned["url"]
    key = presigned["fields"]["key"]
    assert key.startswith(f"uploads/{user.user_id}/") and key.endswith(".png")
    assert ".." not in key and "other-user" not in key and "avatar" not in key
    assert presigned["key"] == key
    assert presigned["max_bytes"] == MAX_UPLOAD_BYTES
    assert presigned["fields"]["Content-Type"] == "image/png"

    conditions = _policy_conditions(presigned)
    assert {"key": key} in conditions  # the signature is only good for this exact object
    assert {"bucket": BUCKET} in conditions
    assert {"Content-Type": "image/png"} in conditions
    assert ["content-length-range", 1, MAX_UPLOAD_BYTES] in conditions

    again = client.post("/uploads/presign", params={"file_type": "image/png"}, headers=auth_headers(user)).json()
    assert again["key"] != key  # a new object every time: an upload cannot overwrite an earlier one

    other = client.post("/uploads/presign", params={"file_type": "image/jpeg"}, headers=auth_headers(make_user()))
    assert not other.json()["key"].startswith(f"uploads/{user.user_id}/")
    assert other.json()["key"].endswith(".jpg")


def test_presign_only_signs_image_uploads(client, make_user, auth_headers, s3_settings):
    headers = auth_headers(make_user())

    for file_type in ("text/html", "image/svg+xml", "application/octet-stream", "image/png; charset=utf-8", ""):
        refused = client.post("/uploads/presign", params={"file_name": "a.png", "file_type": file_type}, headers=headers)
        assert refused.status_code == 422, (file_type, refused.text)

    assert client.post("/uploads/presign", headers=headers).status_code == 422  # file_type is required
    assert client.post("/uploads/presign", params={"file_name": "a.png"}, headers=headers).status_code == 422
    too_long = client.post("/uploads/presign", params={"file_name": "a" * 300, "file_type": "image/png"}, headers=headers)
    assert too_long.status_code == 422

    for file_type, extension in (("image/jpeg", ".jpg"), ("image/png", ".png"), ("image/webp", ".webp"), ("image/gif", ".gif")):
        allowed = client.post("/uploads/presign", params={"file_type": file_type}, headers=headers)
        assert allowed.status_code == 200, (file_type, allowed.text)
        assert allowed.json()["key"].endswith(extension)


def test_presign_accepts_a_json_body(client, make_user, auth_headers, s3_settings):
    user = make_user()
    headers = auth_headers(user)

    response = client.post("/uploads/presign", json={"file_name": "kicks.webp", "file_type": "image/webp"}, headers=headers)

    assert response.status_code == 200, response.text  # used to be a 422: only query parameters were read
    assert response.json()["key"].startswith(f"uploads/{user.user_id}/") and response.json()["key"].endswith(".webp")
    assert {"Content-Type": "image/webp"} in _policy_conditions(response.json())

    assert client.post("/uploads/presign", json={"file_type": "text/html"}, headers=headers).status_code == 422
    assert client.post("/uploads/presign", json={"file_name": "kicks.webp"}, headers=headers).status_code == 422
    assert client.post("/uploads/presign", json={"file_type": "image/png"}).status_code == 401


def test_presign_reports_missing_storage_configuration_as_503(client, make_user, auth_headers, s3_settings, monkeypatch):
    headers = auth_headers(make_user())

    def presign():
        return client.post("/uploads/presign", params={"file_name": "a.png", "file_type": "image/png"}, headers=headers)

    assert presign().status_code == 200

    # no bucket, or the placeholder the route used to sign for
    for bucket in (None, "", "your-s3-bucket-name"):
        with monkeypatch.context() as patch:
            patch.delenv("S3_BUCKET") if bucket is None else patch.setenv("S3_BUCKET", bucket)
            unconfigured = presign()
        assert unconfigured.status_code == 503, (bucket, unconfigured.text)
        assert "not configured" in unconfigured.json()["detail"]

    # the old name from .env.example is not a second setting
    with monkeypatch.context() as patch:
        patch.delenv("S3_BUCKET")
        patch.setenv("S3_BUCKET_NAME", BUCKET)
        assert presign().status_code == 503

    # no credentials at all (used to be a 500), half a key pair, or the .env.example placeholders
    for access_key, secret_key in (
        (None, None),
        ("AKIATESTTESTTESTTEST", None),
        (None, "not-a-real-secret-access-key"),
        ("your_aws_access_key_here", "your_aws_secret_key_here"),
    ):
        with monkeypatch.context() as patch:
            for name, value in (("AWS_ACCESS_KEY_ID", access_key), ("AWS_SECRET_ACCESS_KEY", secret_key)):
                patch.delenv(name) if value is None else patch.setenv(name, value)
            unconfigured = presign()
        assert unconfigured.status_code == 503, (access_key, unconfigured.text)
        assert "not configured" in unconfigured.json()["detail"]
        assert "AKIA" not in unconfigured.text and "secret" not in unconfigured.text.lower()

    assert presign().status_code == 200  # and it recovers once the settings are back


# --- rate limiting ----------------------------------------------------------------


def _request(ip="203.0.113.7", token=None):
    from starlette.requests import Request

    headers = [(b"authorization", f"Bearer {token}".encode())] if token else []
    return Request({"type": "http", "method": "GET", "path": "/", "query_string": b"", "headers": headers, "client": (ip, 50000)})


def _frozen_clock(monkeypatch, start=1_700_000_000.0):
    """Replace the limiter's clock; advance it by assigning to the returned list's only item."""
    from services.core import rate_limiting

    now = [start]
    monkeypatch.setattr(rate_limiting, "time", SimpleNamespace(time=lambda: now[0]))
    return now


def test_a_refused_request_is_not_counted_so_a_polling_client_recovers(monkeypatch):
    import fakeredis

    from services.core.rate_limiting import RateLimiter

    now = _frozen_clock(monkeypatch)
    redis = fakeredis.FakeStrictRedis()
    limiter = RateLimiter(redis)
    request = _request()

    allowed, retry_after = [], []
    for _ in range(16):  # one poll every half second, across four 2-second windows
        info = limiter.check_rate_limit(request, "GET /poll", max_requests=3, window_seconds=2)
        allowed.append(not info["is_limited"])
        retry_after.append(info["retry_after"])
        now[0] += 0.5

    assert allowed[:4] == [True, True, True, False]
    # the refused poll was not recorded, so the next one gets through as soon as the window has moved on
    assert allowed[4:] == [True, True, True, False] * 3
    assert all(sum(allowed[start:start + 4]) <= 3 for start in range(13))  # never more than 3 in any 2 seconds
    assert retry_after[3] == 1 and retry_after[0] == 0
    assert all(redis.zcard(key) <= 3 for key in redis.keys("rate_limit:*"))


def test_requests_in_the_same_instant_are_each_counted(monkeypatch):
    import fakeredis

    from services.core.rate_limiting import RateLimiter

    _frozen_clock(monkeypatch)  # every call sees the same timestamp
    limiter = RateLimiter(fakeredis.FakeStrictRedis())
    request = _request()

    outcomes = [limiter.check_rate_limit(request, "POST /burst", max_requests=2, window_seconds=60) for _ in range(4)]

    assert [info["is_limited"] for info in outcomes] == [False, False, True, True]
    assert [info["current_requests"] for info in outcomes] == [0, 1, 2, 2]
    assert outcomes[2]["retry_after"] == 61 > outcomes[0]["retry_after"] == 0


def test_limiter_identifies_authenticated_callers_by_their_token():
    import fakeredis
    from jose import jwt

    from services.core.auth import create_access_token
    from services.core.rate_limiting import RateLimiter
    from services.core.security import ALGORITHM, SECRET_KEY

    limiter = RateLimiter(fakeredis.FakeStrictRedis())
    alice, bob = uuid.uuid4(), uuid.uuid4()
    address = "198.51.100.4"

    def token_for(user_id, **kwargs):
        return create_access_token({"sub": f"user_{user_id.hex[:8]}", "user_id": str(user_id)}, **kwargs)

    def check(token=None, per_user=True):
        request = _request(ip=address, token=token)
        return limiter.check_rate_limit(request, "POST /posts/", max_requests=2, window_seconds=60, per_user=per_user)

    first = check(token_for(alice))
    assert first["identifier"] == f"user:{alice}"  # used to be the IP address for everyone
    assert not first["is_limited"] and not check(token_for(alice))["is_limited"]
    assert check(token_for(alice))["is_limited"]
    # someone else behind the same address has a budget of their own
    assert check(token_for(bob))["identifier"] == f"user:{bob}"
    assert not check(token_for(bob))["is_limited"]

    # callers without a token, and limits that are per address, are counted by address
    assert check()["identifier"] == f"ip:{address}"
    assert check(token_for(alice), per_user=False)["identifier"] == f"ip:{address}"

    # a token that does not verify must not choose its own bucket
    claims = {"sub": "mallory", "user_id": str(alice), "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    forged = jwt.encode(claims, "someone-elses-signing-key-0123456789abcdef", algorithm=ALGORITHM)
    expired = token_for(alice, expires_delta=timedelta(minutes=-5))
    not_an_access_token = jwt.encode({**claims, "type": "refresh"}, SECRET_KEY, algorithm=ALGORITHM)
    for untrusted in (forged, expired, not_an_access_token, "not-a-token", ""):
        limiter.redis.flushall()
        assert check(untrusted)["identifier"] == f"ip:{address}", untrusted


def test_limits_match_the_method_and_the_exact_route():
    from services.core.rate_limiting import DEFAULT_RATE_LIMIT, get_rate_limit_config

    assert DEFAULT_RATE_LIMIT["max_requests"] == 1000
    # reading is not creating: only POST /posts/ has the posting limit, nothing is matched by prefix
    for method, route in (
        ("GET", "/posts/global"),
        ("GET", "/posts/feed"),
        ("GET", "/posts/user/{user_id}"),
        ("DELETE", "/posts/{post_id}"),
        ("GET", "/posts/"),
        ("GET", "/v1/signals/"),
        ("GET", "/v1/signals/heatmap"),
        ("GET", "/users/"),
        ("GET", "/auth/me"),
        ("POST", "/auth/token/extra"),
    ):
        assert get_rate_limit_config(method, route) is DEFAULT_RATE_LIMIT, (method, route)

    assert get_rate_limit_config("POST", "/posts/")["max_requests"] == 50
    assert get_rate_limit_config("post", "/posts/")["max_requests"] == 50
    assert get_rate_limit_config("POST", "/v1/signals/")["max_requests"] == 100
    assert get_rate_limit_config("POST", "/auth/token") == {"max_requests": 5, "window": 300, "per_user": False}
    # registration is reachable on two routes; both spend one per-address budget
    for route in ("/auth/register", "/users/"):
        assert get_rate_limit_config("POST", route) == {
            "max_requests": 5, "window": 3600, "per_user": False, "counter": "register",
        }
    # as do the two routes that create posts, per user
    assert get_rate_limit_config("POST", "/v1/hyperlocal/signals") is get_rate_limit_config("POST", "/posts/")


def test_every_configured_limit_names_a_real_route():
    from services.core.rate_limiting import RATE_LIMIT_CONFIGS
    from services.main import app

    served = {(method, route.path) for route in app.routes for method in getattr(route, "methods", None) or ()}

    # '/signals' and (once) '/auth/register' were configured but matched no route at all
    assert set(RATE_LIMIT_CONFIGS) <= served, set(RATE_LIMIT_CONFIGS) - served


def test_counters_follow_the_route_not_the_raw_url(client, make_user, auth_headers):
    from services.core.redis_client import r as redis_client

    user = make_user()
    for _ in range(3):  # three different URLs, one route
        client.get(f"/posts/user/{uuid.uuid4()}")
    client.get(f"/posts/user/{uuid.uuid4()}", headers=auth_headers(user))
    for path in ("/no/such/path", "/another/unknown/path"):
        assert client.get(path).status_code == 404
    # /users is answered with a redirect to /users/: that is not a registration attempt
    assert client.post("/users", json={}, follow_redirects=False).status_code == 307

    def counters(identifier):
        prefix = f"rate_limit:{identifier}:"
        return {key[len(prefix):]: redis_client.zcard(key) for key in redis_client.scan_iter(f"{prefix}*")}

    assert counters("ip:testclient") == {
        "GET /posts/user/{user_id}:3600": 3,
        "GET unmatched:3600": 2,
        "POST /users/ (redirect):3600": 1,
    }
    assert counters(f"user:{user.user_id}") == {"GET /posts/user/{user_id}:3600": 1}


def test_reading_feeds_is_not_capped_by_the_posting_limit(client, make_user, auth_headers):
    anonymous = [client.get("/posts/global").status_code for _ in range(53)]
    assert anonymous == [200] * 53  # the 51st used to be a 429 with Retry-After: 3600

    reader, neighbour = auth_headers(make_user()), auth_headers(make_user())
    assert [client.get("/posts/feed", headers=reader).status_code for _ in range(51)] == [200] * 51
    assert client.get("/posts/feed", headers=neighbour).status_code == 200


def test_posting_is_limited_per_user_not_per_address(client, make_user, auth_headers, monkeypatch):
    from services.core import rate_limiting

    monkeypatch.setitem(rate_limiting.POSTING_LIMIT, "max_requests", 3)
    author, neighbour = auth_headers(make_user()), auth_headers(make_user())

    def post(headers):
        return client.post("/posts/", json={"post_type": "GENERAL", "content_text": "restock"}, headers=headers)

    allowed = [post(author) for _ in range(3)]
    assert [response.status_code for response in allowed] == [200, 200, 200]
    assert [response.headers["X-RateLimit-Remaining"] for response in allowed] == ["2", "1", "0"]

    refused = post(author)
    assert refused.status_code == 429
    assert refused.json()["retry_after"] == int(refused.headers["Retry-After"])
    assert 0 < int(refused.headers["Retry-After"]) <= 3600
    assert refused.headers["X-RateLimit-Limit"] == "3"

    # the other route that creates posts spends the same budget
    pinned = {"content_text": "restock", "geo_tag_lat": 42.36, "geo_tag_long": -71.06}
    assert client.post("/v1/hyperlocal/signals", json=pinned, headers=author).status_code == 429

    # the same address, another account: unaffected. And the author can still read.
    assert post(neighbour).status_code == 200
    assert client.get("/posts/feed", headers=author).status_code == 200
    assert client.get("/posts/global").status_code == 200


def test_registration_is_throttled_on_both_routes(client):
    weak = {"username": "throttled", "email": "throttled@example.com", "display_name": "T", "password": "short"}

    # POST /users/ used to get the default 1000 per hour, and later a budget of its own,
    # so alternating between the two routes doubled the limit. They share one counter.
    paths = ["/users/", "/auth/register", "/users/", "/auth/register", "/users/", "/auth/register", "/users/"]
    statuses = [client.post(path, json=weak).status_code for path in paths]
    assert statuses == [400, 400, 400, 400, 400, 429, 429], statuses

    assert client.get("/users/").status_code == 401  # listing users is not registration: not throttled with it


# --- placeholder endpoints --------------------------------------------------------

PLACEHOLDER_CALLS = (
    ("POST", "/hyperlocal/cells/dr5reg/follow"),
    ("DELETE", "/hyperlocal/cells/dr5reg/follow"),
    ("GET", "/hyperlocal/cells/follows"),
    ("POST", "/hyperlocal/heat/subscribe?threshold=5"),
    ("GET", "/hyperlocal/heat/subscriptions"),
)


def test_placeholder_endpoints_require_an_active_signed_in_user(client, db_session, make_user, auth_headers):
    for method, path in PLACEHOLDER_CALLS:
        assert client.request(method, path).status_code == 401, (method, path)
        garbage = client.request(method, path, headers={"Authorization": "Bearer not-a-token"})
        assert garbage.status_code == 401, (method, path)

    banned = make_user()
    banned.is_active = False
    db_session.commit()
    for method, path in PLACEHOLDER_CALLS:
        assert client.request(method, path, headers=auth_headers(banned)).status_code == 403, (method, path)

    headers = auth_headers(make_user())
    for method, path in PLACEHOLDER_CALLS:
        assert client.request(method, path, headers=headers).status_code == 200, (method, path)


def test_placeholder_endpoints_validate_their_input(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    # geohash cells: 1-12 characters from the geohash alphabet (no a, i, l, o)
    for cell in ("dr5rea", "9q8yyi", "DR5REG", "dr5 reg", "dr5reg!", "d" * 13, "%00", "dr5reg%0A"):
        for method in ("POST", "DELETE"):
            response = client.request(method, f"/hyperlocal/cells/{cell}/follow", headers=headers)
            assert response.status_code == 422, (method, cell, response.text)

    for threshold in ("-9", "0", "1001", "five", "2.5"):
        response = client.post(f"/hyperlocal/heat/subscribe?threshold={threshold}", headers=headers)
        assert response.status_code == 422, (threshold, response.text)



def test_placeholder_responses_keep_their_shape(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    assert client.post("/hyperlocal/cells/dr5reg/follow", headers=headers).json() == {"ok": True, "cell_id": "dr5reg"}
    assert client.delete("/hyperlocal/cells/9q8yyx/follow", headers=headers).json() == {"ok": True, "cell_id": "9q8yyx"}
    follows = client.get("/hyperlocal/cells/follows", headers=headers).json()
    assert isinstance(follows, list) and all(isinstance(cell, str) for cell in follows)

    assert client.post("/hyperlocal/heat/subscribe", headers=headers).json() == {"ok": True, "threshold": 5}
    assert client.post("/hyperlocal/heat/subscribe?threshold=1000", headers=headers).json() == {"ok": True, "threshold": 1000}
    subscriptions = client.get("/hyperlocal/heat/subscriptions", headers=headers).json()
    assert all(isinstance(item["threshold"], int) for item in subscriptions["items"])



def test_health_probes_are_never_rate_limited(client):
    from services.core.redis_client import r as redis_client

    for path in ("/health", "/health/ready"):
        assert client.get(path).status_code == 200
    counted = [key for key in redis_client.scan_iter("rate_limit:ip:testclient:*") if b"health" in key or "health" in str(key)]
    assert counted == []
