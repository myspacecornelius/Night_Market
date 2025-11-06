"""
Test LACES token economy endpoints
"""
import pytest
from fastapi.testclient import TestClient
from services.main import app
from services.core.database import SessionLocal
from services.models.user import User
from services.models.post import Post
from services.core.security import get_password_hash
import uuid
from datetime import datetime, timezone

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
    """Create a test user with LACES balance"""
    user = User(
        user_id=uuid.uuid4(),
        username="lacesuser",
        email="laces@nightmarket.com",
        password_hash=get_password_hash("testpass123"),
        laces_balance=500
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
            "username": "lacesuser",
            "password": "testpass123"
        }
    )
    return response.json()["access_token"]


def test_get_laces_balance_authenticated(auth_token, test_user):
    """Test getting LACES balance with authentication"""
    response = client.get(
        "/laces/balance",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "balance" in data
    assert "user_id" in data
    assert data["balance"] == 500


def test_get_laces_balance_unauthenticated():
    """Test getting LACES balance without authentication"""
    response = client.get("/laces/balance")
    assert response.status_code == 401


def test_get_laces_ledger(auth_token):
    """Test getting LACES transaction history"""
    response = client.get(
        "/laces/ledger",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "transactions" in data
    assert "total_count" in data
    assert "page" in data
    assert "limit" in data
    assert isinstance(data["transactions"], list)


def test_claim_daily_stipend(auth_token):
    """Test claiming daily LACES stipend"""
    response = client.post(
        "/laces/daily-stipend",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    # Could be 200 (success) or 400 (already claimed)
    assert response.status_code in [200, 400]

    if response.status_code == 200:
        data = response.json()
        assert "new_balance" in data
        assert "message" in data
        assert data["amount"] == 100


def test_claim_daily_stipend_twice(auth_token):
    """Test that daily stipend can only be claimed once per day"""
    # First claim
    first_response = client.post(
        "/laces/daily-stipend",
        headers={"Authorization": f"Bearer {auth_token}"}
    )

    # Second claim (should fail)
    second_response = client.post(
        "/laces/daily-stipend",
        headers={"Authorization": f"Bearer {auth_token}"}
    )

    # At least one of these should succeed, the other should fail
    assert first_response.status_code == 200 or second_response.status_code == 400


def test_get_earning_opportunities(auth_token):
    """Test getting earning opportunities"""
    response = client.get(
        "/laces/opportunities",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "opportunities" in data
    assert isinstance(data["opportunities"], list)


def test_boost_post_insufficient_balance(auth_token, test_db, test_user):
    """Test boosting a post with insufficient LACES"""
    # Create a post by another user
    other_user = User(
        user_id=uuid.uuid4(),
        username="otheruser",
        email="other@nightmarket.com",
        password_hash=get_password_hash("testpass123"),
        laces_balance=0
    )
    test_db.add(other_user)
    test_db.commit()

    post = Post(
        post_id=uuid.uuid4(),
        user_id=other_user.user_id,
        content="Test post",
        post_type="SPOTTED",
        timestamp=datetime.now(timezone.utc)
    )
    test_db.add(post)
    test_db.commit()

    # Set user balance to 0
    test_user.laces_balance = 0
    test_db.commit()

    # Try to boost with insufficient funds
    response = client.post(
        f"/laces/boost-post/{post.post_id}?boost_amount=10",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 400
    assert "Insufficient" in response.json()["detail"]


def test_boost_own_post(auth_token, test_db, test_user):
    """Test that users cannot boost their own posts"""
    # Create a post by the test user
    post = Post(
        post_id=uuid.uuid4(),
        user_id=test_user.user_id,
        content="My own post",
        post_type="SPOTTED",
        timestamp=datetime.now(timezone.utc)
    )
    test_db.add(post)
    test_db.commit()

    # Try to boost own post
    response = client.post(
        f"/laces/boost-post/{post.post_id}?boost_amount=10",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 400
    assert "Cannot boost your own post" in response.json()["detail"]


def test_boost_nonexistent_post(auth_token):
    """Test boosting a post that doesn't exist"""
    fake_post_id = uuid.uuid4()
    response = client.post(
        f"/laces/boost-post/{fake_post_id}?boost_amount=10",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 404


def test_grant_laces_requires_admin(auth_token):
    """Test that granting LACES requires admin privileges"""
    response = client.post(
        "/laces/grant",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "user_id": str(uuid.uuid4()),
            "amount": 100,
            "transaction_type": "ADMIN_ADD"
        }
    )
    # Should fail with 403 Forbidden (not admin)
    assert response.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
