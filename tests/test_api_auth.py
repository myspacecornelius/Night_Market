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
    test_db.query(User).filter(User.username == "testuser").delete()
    test_db.commit()
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
    response = client.get("/v1/laces/balance")
    assert response.status_code == 401


def test_protected_endpoint_with_invalid_token():
    """Test accessing protected endpoint with invalid token"""
    response = client.get(
        "/v1/laces/balance",
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


def test_logout_revokes_sessions(test_user):
    """Logout revokes refresh sessions (access JWTs stay valid until expiry)"""
    login = client.post("/auth/token", data={"username": "testuser", "password": "testpass123"})
    tokens = login.json()
    response = client.post(
        "/auth/logout", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert response.status_code == 200
    assert response.json()["sessions_revoked"] >= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
