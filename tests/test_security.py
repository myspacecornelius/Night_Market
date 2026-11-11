"""Security hardening: signing secret, tokens, admin rights, private zones, login."""
import os
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from jose import jwt

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE_SECRET = "dharma_jwt_secret_key_change_in_production_use_openssl_rand_hex_32"
PRIVATE_SECRET = "5f2d8c1b9e7a4c3d6f0a1b2c3d4e5f60718293a4b5c6d7e8f9010203040506ab"
PASSWORD = "Sup3r-Secret-Pass!"


@pytest.mark.parametrize("secret, environment, should_start", [
    (None, None, False),                      # nothing configured: refuse rather than assume development
    (None, "production", False),
    (None, "Production", False),
    (None, "staging", False),
    (EXAMPLE_SECRET, "production", False),    # the value published in .env.example
    (EXAMPLE_SECRET, None, False),
    (None, "development", True),
    (EXAMPLE_SECRET, "development", True),
    (EXAMPLE_SECRET, "test", True),
    (PRIVATE_SECRET, "production", True),
    (PRIVATE_SECRET, None, True),
    ("short-private-secret", "production", False),
])
def test_published_signing_secrets_only_work_in_development(secret, environment, should_start):
    env = {key: value for key, value in os.environ.items() if key not in ("JWT_SECRET_KEY", "ENVIRONMENT")}
    env["PYTHONPATH"] = str(ROOT)
    if secret is not None:
        env["JWT_SECRET_KEY"] = secret
    if environment is not None:
        env["ENVIRONMENT"] = environment

    result = subprocess.run(
        [sys.executable, "-W", "ignore", "-c", "import services.core.security"],
        env=env, cwd=str(ROOT), capture_output=True, text=True, timeout=60,
    )

    assert (result.returncode == 0) is should_start, result.stderr[-400:]


def _token(claims):
    from services.core.security import ALGORITHM, SECRET_KEY

    return {"Authorization": "Bearer " + jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)}


def test_tokens_without_an_expiry_are_rejected(client, make_user):
    user = make_user()
    claims = {"sub": user.username, "user_id": str(user.user_id), "type": "access"}

    assert client.get("/auth/me", headers=_token(claims)).status_code == 401
    claims["exp"] = datetime.now(timezone.utc) + timedelta(minutes=5)
    assert client.get("/auth/me", headers=_token(claims)).status_code == 200


def test_a_token_does_not_follow_a_reused_username(client, make_user):
    user = make_user()
    exp = datetime.now(timezone.utc) + timedelta(minutes=5)

    # a token minted for an earlier account that had this username
    stale = {"sub": user.username, "user_id": str(uuid.uuid4()), "type": "access", "exp": exp}
    assert client.get("/auth/me", headers=_token(stale)).status_code == 401

    garbage = {"sub": user.username, "user_id": "not-a-uuid", "type": "access", "exp": exp}
    assert client.get("/auth/me", headers=_token(garbage)).status_code == 401


def test_admin_rights_come_only_from_the_database(client, db_session, make_user, auth_headers, monkeypatch):
    from services.admin.promote import set_admin

    user = make_user()
    monkeypatch.setenv("ADMIN_USERS", user.username)  # used to make any account with a listed name an admin
    payload = {"user_id": str(user.user_id), "amount": 5, "transaction_type": "ADMIN_ADD"}

    assert client.post("/v1/laces/grant", json=payload, headers=auth_headers(user)).status_code == 403

    assert set_admin(db_session, user.username).is_admin is True
    db_session.commit()
    assert client.post("/v1/laces/grant", json=payload, headers=auth_headers(user)).status_code == 200

    assert set_admin(db_session, user.username, is_admin=False).is_admin is False
    db_session.commit()
    assert client.post("/v1/laces/grant", json=payload, headers=auth_headers(user)).status_code == 403
    assert set_admin(db_session, "no_such_user") is None


def test_login_does_the_same_work_for_unknown_accounts(client, monkeypatch):
    from services.core import security
    from services.routers import auth as auth_router

    checked = []
    real_verify = security.verify_password

    def recording_verify(password, password_hash):
        checked.append(password_hash)
        return real_verify(password, password_hash)

    monkeypatch.setattr(auth_router, "verify_password", recording_verify)

    response = client.post("/auth/token", data={"username": "nobody_here", "password": PASSWORD})

    assert response.status_code == 401
    assert checked == [security.DUMMY_PASSWORD_HASH]  # one bcrypt check, as for a real account


def test_passwords_longer_than_bcrypt_reads_are_refused(client):
    def register(password):
        return client.post("/users/", json={
            "username": f"u_{uuid.uuid4().hex[:8]}", "email": f"{uuid.uuid4().hex[:8]}@example.com",
            "display_name": "X", "password": password,
        })

    too_long = "Aa1!" + "x" * 80  # bcrypt would silently ignore everything after byte 72
    assert register(too_long).status_code == 400
    assert register("Aa1!" + "x" * 60).status_code == 200


def test_private_dropzones_are_invisible_to_non_members(client, make_user, auth_headers):
    owner, outsider = make_user(), make_user()
    created = client.post(
        "/v1/dropzones",
        json={"name": "Back room", "center_lat": 42.36, "center_lng": -71.06, "is_public": False,
              "rules": "door code 4711"},
        headers=auth_headers(owner),
    )
    assert created.status_code == 200
    zone_id = created.json()["id"]
    here = {"lat": 42.3601, "lng": -71.0601}

    def names(headers=None):
        return [zone["name"] for zone in client.get("/v1/dropzones", headers=headers).json()]

    assert names() == []
    assert names(auth_headers(outsider)) == []
    assert names(auth_headers(owner)) == ["Back room"]

    assert client.get(f"/v1/dropzones/{zone_id}").status_code == 404
    assert client.get(f"/v1/dropzones/{zone_id}", headers=auth_headers(outsider)).status_code == 404
    assert client.post(f"/v1/dropzones/{zone_id}/join", headers=auth_headers(outsider)).status_code == 404
    assert client.post(f"/v1/dropzones/{zone_id}/checkin", json=here, headers=auth_headers(outsider)).status_code == 404

    details = client.get(f"/v1/dropzones/{zone_id}", headers=auth_headers(owner))
    assert details.status_code == 200 and details.json()["rules"] == "door code 4711"
    assert client.post(f"/v1/dropzones/{zone_id}/checkin", json=here, headers=auth_headers(owner)).status_code == 200


def test_heatmap_cache_keys_ignore_cosmetic_differences_in_the_query(client):
    from services.core.redis_client import r as redis_client

    assert client.get("/v1/heatmap?bbox=-71.2,42.2,-70.9,42.5").status_code == 200
    assert client.get("/v1/heatmap?bbox=-71.20000001,42.2000,-70.9,42.50000004").status_code == 200

    assert len(list(redis_client.scan_iter("heatmap:*"))) == 1


def _register_and_login(client, username="rotator"):
    registered = client.post(
        "/users/",
        json={"username": username, "email": f"{username}@example.com", "display_name": "R", "password": PASSWORD},
    )
    assert registered.status_code == 200, registered.text
    return client.post("/auth/token", data={"username": username, "password": PASSWORD}).json()


def test_a_refresh_token_can_be_claimed_only_once(client, db_session):
    from services.core.auth import claim_refresh_session

    tokens = _register_and_login(client)

    # the check and the revocation are one statement: the second claim finds nothing
    assert claim_refresh_session(db_session, tokens["refresh_token"]) is not None
    assert claim_refresh_session(db_session, tokens["refresh_token"]) is None


def test_replaying_a_rotated_refresh_token_ends_every_session(client, db_session):
    from services.models.session import UserSession

    first = _register_and_login(client)
    second = client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]}).json()
    bearer = {"Authorization": f"Bearer {second['access_token']}"}

    # moments later (two browser tabs racing) it is only refused
    assert client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401
    assert client.get("/auth/me", headers=bearer).status_code == 200

    # later, the old token turning up again means someone copied it
    rotated = db_session.query(UserSession).filter(
        UserSession.refresh_token_hash == UserSession.hash_refresh_token(first["refresh_token"])
    ).one()
    rotated.last_used_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.commit()

    assert client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401
    assert client.get("/auth/me", headers=bearer).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": second["refresh_token"]}).status_code == 401

    # the owner signs in again; presenting the copied token once more must not sign them out again
    fresh = client.post("/auth/token", data={"username": "rotator", "password": PASSWORD}).json()
    db_session.query(UserSession).filter(
        UserSession.refresh_token_hash == UserSession.hash_refresh_token(first["refresh_token"])
    ).update({"last_used_at": datetime.now(timezone.utc) - timedelta(minutes=5)})
    db_session.commit()
    assert client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {fresh['access_token']}"}).status_code == 200


def test_oversized_bodies_are_refused_before_they_are_parsed(client, make_user, auth_headers):
    headers = auth_headers(make_user())
    big = "x" * (1024 * 1024 + 1)

    declared = client.post("/posts/", json={"content_text": big}, headers=headers)
    assert declared.status_code == 413

    def chunks():  # no Content-Length: sent with chunked transfer encoding
        yield b'{"content_text": "'
        for _ in range(300):
            yield b"x" * 4096
        yield b'"}'

    streamed = client.post("/posts/", content=chunks(), headers={**headers, "Content-Type": "application/json"})
    assert streamed.status_code == 413

    assert client.post("/posts/", json={"content_text": "small"}, headers=headers).status_code == 200


def test_tags_have_a_length_limit(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    assert client.post("/posts/", json={"content_text": "x", "tags": ["a" * 51]}, headers=headers).status_code == 422
    assert client.post("/posts/", json={"content_text": "x", "tags": [""]}, headers=headers).status_code == 422
    assert client.post("/posts/", json={"content_text": "x", "tags": ["jordan-1"]}, headers=headers).status_code == 200
    zone = {"name": "x", "center_lat": 1, "center_lng": 1, "tags": ["a" * 51]}
    assert client.post("/v1/dropzones", json=zone, headers=headers).status_code == 422


def test_nul_bytes_nan_and_huge_passwords_are_client_errors(client, db_session, make_user, auth_headers):
    headers = auth_headers(make_user())
    _register_and_login(client, "nul_probe")

    def status_of(response):
        # a request that failed in the database leaves the shared test session needing a
        # rollback; the application gives every request its own session
        db_session.rollback()
        return response.status_code

    def login(username, password):
        return status_of(client.post("/auth/token", data={"username": username, "password": password}))

    assert login("nul_probe", "bad\x00password") == 401
    assert login("nul_probe", "x" * 5000) == 401
    assert login("nul\x00probe", PASSWORD) in (401, 422)

    register = {"username": "nul_reg", "email": "nul_reg@example.com", "display_name": "N", "password": PASSWORD}
    assert status_of(client.post("/users/", json={**register, "password": "Sup3r-Secret\x00Pass!"})) in (400, 422)
    assert status_of(client.post("/users/", json={**register, "display_name": "N\x00"})) == 422
    assert status_of(client.post("/posts/", json={"content_text": "a\x00b"}, headers=headers)) == 422

    nan_body = '{"name": "x", "center_lat": NaN, "center_lng": 1}'
    nan = client.post("/v1/dropzones", content=nan_body, headers={**headers, "Content-Type": "application/json"})
    assert nan.status_code == 422


def test_rate_limited_and_failed_responses_keep_cors_and_security_headers(client, monkeypatch):
    from fastapi import APIRouter

    from services.main import app

    origin = {"Origin": "http://localhost:5173"}
    probe = APIRouter()

    @probe.get("/_probe/boom")
    def boom():
        raise RuntimeError("unexpected")

    app.include_router(probe)
    try:
        failed = client.get("/_probe/boom", headers=origin)
    finally:
        app.router.routes[:] = [r for r in app.router.routes if not getattr(r, "path", "").startswith("/_probe/")]

    assert failed.status_code == 500 and failed.json() == {"detail": "Internal server error"}
    assert failed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert failed.headers["x-content-type-options"] == "nosniff"

    statuses = [client.post("/auth/token", data={"username": "nobody", "password": "x"}, headers=origin) for _ in range(12)]
    limited = [response for response in statuses if response.status_code == 429]
    assert limited, [response.status_code for response in statuses]
    assert limited[0].headers["access-control-allow-origin"] == "http://localhost:5173"
    assert limited[0].headers["x-content-type-options"] == "nosniff"


def test_api_docs_are_not_blocked_by_the_content_security_policy(client):
    docs = client.get("/docs")
    assert docs.status_code == 200
    assert "content-security-policy" not in docs.headers
    assert client.get("/health").headers["content-security-policy"] == "default-src 'self'"


@pytest.mark.parametrize("environment, enable_docs, expected", [
    ("production", None, 404),
    ("production", "true", 200),
    ("development", None, 200),
])
def test_api_docs_are_off_outside_development(environment, enable_docs, expected):
    env = {key: value for key, value in os.environ.items() if key != "ENABLE_DOCS"}
    env.update(PYTHONPATH=str(ROOT), ENVIRONMENT=environment, JWT_SECRET_KEY=PRIVATE_SECRET)
    if enable_docs is not None:
        env["ENABLE_DOCS"] = enable_docs
    code = (
        "from fastapi.testclient import TestClient; from services.main import app; c = TestClient(app); "
        "print(c.get('/docs').status_code, c.get('/openapi.json').status_code)"
    )

    result = subprocess.run(
        [sys.executable, "-W", "ignore", "-c", code], env=env, cwd=str(ROOT), capture_output=True, text=True, timeout=120,
    )

    assert result.stdout.split()[-2:] == [str(expected), str(expected)], result.stderr[-600:]


def test_heatmap_refresh_flushes_at_most_once_per_cooldown(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    assert client.post("/v1/heatmap/refresh", headers=headers).json()["throttled"] is False
    again = client.post("/v1/heatmap/refresh", headers=auth_headers(make_user()))
    assert again.status_code == 200 and again.json() == {"cache_keys_cleared": 0, "throttled": True}


def test_usernames_are_unique_ignoring_case(client):
    def register(username, email):
        body = {"username": username, "email": email, "display_name": "N", "password": PASSWORD}
        return client.post("/users/", json=body).status_code

    assert register("Night_Owl", "owl@example.com") == 200
    assert register("night_owl", "other@example.com") == 409  # a look-alike of the first account
    assert register("NIGHT_OWL", "third@example.com") == 409

    # and so the name works at login however it is typed
    assert client.post("/auth/token", data={"username": "night_owl", "password": PASSWORD}).status_code == 200


def test_the_database_refuses_usernames_that_differ_only_by_case(db_session, make_user):
    from sqlalchemy.exc import IntegrityError

    from services.models.user import User

    first = make_user()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(User(
                username=first.username.upper(), email="upper@example.com", display_name="U", password_hash="x",
            ))
            db_session.flush()
