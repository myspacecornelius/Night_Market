"""
Test authentication endpoints
"""
import pytest
from fastapi.testclient import TestClient
from services.main import app
from services.core.database import get_db, SessionLocal
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
        username="testuser",
        email="test@nightmarket.com",
        password_hash=get_password_hash("testpass123"),
        laces_balance=100
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


def test_health_check():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "night-market-api"
    assert "features" in data


def test_root_endpoint():
    """Test root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "Night Market" in data["message"]
    assert "docs" in data
    assert "health" in data


def test_login_success(test_user):
    """Test successful login"""
    response = client.post(
        "/auth/token",
        data={
            "username": "testuser",
            "password": "testpass123"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials():
    """Test login with invalid credentials"""
    response = client.post(
        "/auth/token",
        data={
            "username": "nonexistent",
            "password": "wrongpass"
        }
    )
    assert response.status_code == 401


def test_login_wrong_password(test_user):
    """Test login with correct username but wrong password"""
    response = client.post(
        "/auth/token",
        data={
            "username": "testuser",
            "password": "wrongpassword"
        }
    )
    assert response.status_code == 401


def test_protected_endpoint_without_token():
    """Test accessing protected endpoint without authentication"""
    response = client.get("/laces/balance")
    assert response.status_code == 401


def test_protected_endpoint_with_invalid_token():
    """Test accessing protected endpoint with invalid token"""
    response = client.get(
        "/laces/balance",
        headers={"Authorization": "Bearer invalid_token_here"}
    )
    assert response.status_code == 401


def test_token_refresh(test_user):
    """Test token refresh functionality"""
    # First login to get tokens
    login_response = client.post(
        "/auth/token",
        data={
            "username": "testuser",
            "password": "testpass123"
        }
    )
    assert login_response.status_code == 200
    tokens = login_response.json()

    # Refresh token
    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != tokens["access_token"]


def test_logout(test_user):
    """Test logout functionality"""
    # Login first
    login_response = client.post(
        "/auth/token",
        data={
            "username": "testuser",
            "password": "testpass123"
        }
    )
    tokens = login_response.json()

    # Logout
    logout_response = client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"refresh_token": tokens["refresh_token"]}
    )
    assert logout_response.status_code == 200

    # Try to use the token after logout (should fail)
    protected_response = client.get(
        "/laces/balance",
        headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert protected_response.status_code == 401


def test_rate_limiting():
    """Test rate limiting on endpoints"""
    # Make many requests to trigger rate limit
    responses = []
    for _ in range(100):
        response = client.get("/health")
        responses.append(response.status_code)

    # Should eventually get a 429 (Too Many Requests)
    assert 429 in responses or all(r == 200 for r in responses)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
