"""Signals API tests (require the PostGIS-backed test database)."""
import uuid

import pytest
from fastapi.testclient import TestClient

from services.core.database import SessionLocal
from services.core.security import get_password_hash
from services.main import app
from services.models.user import User

client = TestClient(app)

NYC = {"latitude": 40.7589, "longitude": -73.9851}


@pytest.fixture
def auth_headers():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:8]
    user = User(
        user_id=uuid.uuid4(),
        username=f"signaluser_{suffix}",
        email=f"signal_{suffix}@nightmarket.com",
        password_hash=get_password_hash("testpass123"),
        laces_balance=100,
    )
    db.add(user)
    db.commit()
    username = user.username
    db.close()
    resp = client.post("/auth/token", data={"username": username, "password": "testpass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _payload(**overrides):
    return {**NYC, "signal_type": "SPOTTED", "text_content": "Jordan 1s in stock", **overrides}


def test_create_signal_requires_auth():
    assert client.post("/v1/signals/", json=_payload()).status_code == 401


def test_create_signal(auth_headers):
    resp = client.post("/v1/signals/", headers=auth_headers, json=_payload())
    assert resp.status_code == 201
    data = resp.json()
    assert data["signal_type"] == "SPOTTED"
    assert data["geohash"]


@pytest.mark.parametrize(
    "overrides",
    [{"latitude": 999.0}, {"longitude": -999.0}, {"signal_type": "NOPE"}, {"visibility": "nope"}],
)
def test_create_signal_validation(auth_headers, overrides):
    resp = client.post("/v1/signals/", headers=auth_headers, json=_payload(**overrides))
    assert resp.status_code == 422


def test_list_signals_shape():
    resp = client.get("/v1/signals/?bbox=-74.0,40.7,-73.9,40.8&time_window=24h")
    assert resp.status_code == 200
    body = resp.json()
    assert {"signals", "total", "page", "per_page", "has_next"} <= body.keys()


def test_boost_unknown_signal(auth_headers):
    resp = client.post(f"/v1/signals/{uuid.uuid4()}/boost", headers=auth_headers)
    assert resp.status_code == 404


def test_cannot_boost_own_signal(auth_headers):
    created = client.post("/v1/signals/", headers=auth_headers, json=_payload()).json()
    resp = client.post(f"/v1/signals/{created['id']}/boost", headers=auth_headers)
    assert resp.status_code == 400
