"""
Test geospatial signals endpoints
"""
import pytest
from fastapi.testclient import TestClient
from services.main import app
from services.core.database import SessionLocal
from services.models.user import User
from services.core.security import get_password_hash
import uuid

client = TestClient(app)


@pytest.fixture
def test_db():
    """Create a test database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def test_user(test_db):
    """Create a test user"""
    user = User(
        user_id=uuid.uuid4(),
        username="signaluser",
        email="signal@nightmarket.com",
        password_hash=get_password_hash("testpass123"),
        laces_balance=100
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def auth_token(test_user):
    """Get auth token for test user"""
    response = client.post(
        "/auth/token",
        data={
            "username": "signaluser",
            "password": "testpass123"
        }
    )
    return response.json()["access_token"]


def test_create_signal_authenticated(auth_token):
    """Test creating a signal with authentication"""
    signal_data = {
        "latitude": 40.7589,  # Times Square, NYC
        "longitude": -73.9851,
        "signal_type": "SPOTTED",
        "content": "Just saw the new Jordan 1s at Nike SoHo!",
        "product_name": "Air Jordan 1 Retro High OG",
        "brand": "Nike",
        "sku": "555088-134",
        "visibility": "public",
        "expires_hours": 24
    }

    response = client.post(
        "/v1/signals",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=signal_data
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["signal_type"] == "SPOTTED"
    assert "geohash" in data


def test_create_signal_unauthenticated():
    """Test that creating a signal requires authentication"""
    signal_data = {
        "latitude": 40.7589,
        "longitude": -73.9851,
        "signal_type": "SPOTTED",
        "content": "Test signal",
        "visibility": "public"
    }

    response = client.post("/v1/signals", json=signal_data)
    assert response.status_code == 401


def test_create_signal_invalid_coordinates(auth_token):
    """Test creating a signal with invalid coordinates"""
    signal_data = {
        "latitude": 999.0,  # Invalid latitude
        "longitude": -73.9851,
        "signal_type": "SPOTTED",
        "content": "Test signal"
    }

    response = client.post(
        "/v1/signals",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=signal_data
    )
    # Should fail validation (422 Unprocessable Entity or 400 Bad Request)
    assert response.status_code in [400, 422]


def test_get_signals_by_bbox(auth_token):
    """Test getting signals within a bounding box"""
    # NYC area bounding box
    bbox = "-74.0,40.7,-73.9,40.8"  # min_lng,min_lat,max_lng,max_lat

    response = client.get(
        f"/v1/signals?bbox={bbox}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_signals_by_geohash(auth_token):
    """Test getting signals by geohash"""
    # NYC Times Square geohash prefix
    geohash = "dr5ru"

    response = client.get(
        f"/v1/signals?geohash={geohash}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_signals_by_radius(auth_token):
    """Test getting signals within a radius"""
    response = client.get(
        "/v1/signals?latitude=40.7589&longitude=-73.9851&radius_km=5",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_signals_with_filters(auth_token):
    """Test getting signals with type filter"""
    response = client.get(
        "/v1/signals?signal_type=SPOTTED&limit=10",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Verify all returned signals are of type SPOTTED
    for signal in data:
        assert signal["signal_type"] == "SPOTTED"


def test_get_signal_by_id(auth_token):
    """Test getting a specific signal by ID"""
    # First create a signal
    signal_data = {
        "latitude": 40.7589,
        "longitude": -73.9851,
        "signal_type": "STOCK_CHECK",
        "content": "Checking stock at Nike SoHo",
        "visibility": "public"
    }

    create_response = client.post(
        "/v1/signals",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=signal_data
    )
    assert create_response.status_code == 200
    signal_id = create_response.json()["id"]

    # Get the signal by ID
    get_response = client.get(
        f"/v1/signals/{signal_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["id"] == signal_id
    assert data["signal_type"] == "STOCK_CHECK"


def test_update_signal(auth_token):
    """Test updating a signal"""
    # Create a signal first
    signal_data = {
        "latitude": 40.7589,
        "longitude": -73.9851,
        "signal_type": "SPOTTED",
        "content": "Original content",
        "visibility": "public"
    }

    create_response = client.post(
        "/v1/signals",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=signal_data
    )
    signal_id = create_response.json()["id"]

    # Update the signal
    update_data = {
        "content": "Updated content",
        "product_name": "Air Jordan 1"
    }

    update_response = client.patch(
        f"/v1/signals/{signal_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=update_data
    )
    assert update_response.status_code == 200
    data = update_response.json()
    assert data["content"] == "Updated content"


def test_delete_signal(auth_token):
    """Test deleting a signal"""
    # Create a signal first
    signal_data = {
        "latitude": 40.7589,
        "longitude": -73.9851,
        "signal_type": "SPOTTED",
        "content": "To be deleted",
        "visibility": "public"
    }

    create_response = client.post(
        "/v1/signals",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=signal_data
    )
    signal_id = create_response.json()["id"]

    # Delete the signal
    delete_response = client.delete(
        f"/v1/signals/{signal_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert delete_response.status_code == 200

    # Verify it's deleted
    get_response = client.get(
        f"/v1/signals/{signal_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert get_response.status_code == 404


def test_boost_signal(auth_token):
    """Test boosting a signal"""
    # Create a signal first
    signal_data = {
        "latitude": 40.7589,
        "longitude": -73.9851,
        "signal_type": "SPOTTED",
        "content": "Hot signal",
        "visibility": "public"
    }

    create_response = client.post(
        "/v1/signals",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=signal_data
    )
    signal_id = create_response.json()["id"]

    # Boost the signal
    boost_response = client.post(
        f"/v1/signals/{signal_id}/boost",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    # Could succeed or fail depending on LACES balance
    assert boost_response.status_code in [200, 400]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
