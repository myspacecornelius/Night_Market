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
