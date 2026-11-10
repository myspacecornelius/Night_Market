from services.models.laces import LacesLedger


def test_laces_ledger_creation(db_session, make_user):
    """Test creating a LACES ledger entry"""
    user = make_user(laces_balance=0)

    # Create a transaction
    transaction = LacesLedger(
        user_id=user.user_id,
        amount=10,
        transaction_type="DAILY_STIPEND",
        description="Test stipend",
        balance_after=10
    )

    db_session.add(transaction)
    db_session.commit()

    assert transaction.id is not None
    assert transaction.amount == 10
    assert transaction.balance_after == 10


def test_laces_balance_calculation(db_session, make_user):
    """Test that balance is correctly calculated"""
    user = make_user(laces_balance=100)

    # Add transaction
    user.laces_balance += 50
    transaction = LacesLedger(
        user_id=user.user_id,
        amount=50,
        transaction_type="POST_REWARD",
        description="Post reward",
        balance_after=user.laces_balance
    )

    db_session.add(transaction)
    db_session.commit()

    assert user.laces_balance == 150
    assert transaction.balance_after == 150


def test_negative_transaction(db_session, make_user):
    """Test spending LACES tokens"""
    user = make_user(laces_balance=100)

    # Spend tokens
    user.laces_balance -= 30
    transaction = LacesLedger(
        user_id=user.user_id,
        amount=-30,
        transaction_type="PURCHASE",
        description="Bought item",
        balance_after=user.laces_balance
    )

    db_session.add(transaction)
    db_session.commit()

    assert user.laces_balance == 70
    assert transaction.amount == -30


# --- API ---------------------------------------------------------------------

def test_laces_endpoints_require_authentication(client):
    assert client.get("/v1/laces/balance").status_code == 401
    assert client.get("/v1/laces/ledger").status_code == 401
    assert client.get("/v1/laces/opportunities").status_code == 401
    assert client.post("/v1/laces/daily-stipend").status_code == 401
    assert client.post("/v1/laces/grant", json={}).status_code == 401


def test_balance_is_the_callers_own(client, make_user, auth_headers):
    user = make_user(laces_balance=250)

    response = client.get("/v1/laces/balance", headers=auth_headers(user))

    assert response.status_code == 200
    assert response.json()["balance"] == 250
    assert response.json()["user_id"] == str(user.user_id)


def test_daily_stipend_can_only_be_claimed_once_per_day(client, make_user, auth_headers):
    user = make_user(laces_balance=100)
    headers = auth_headers(user)

    first = client.post("/v1/laces/daily-stipend", headers=headers)
    second = client.post("/v1/laces/daily-stipend", headers=headers)

    assert first.status_code == 200
    assert first.json()["new_balance"] == 200
    assert second.status_code == 400

    ledger = client.get("/v1/laces/ledger", headers=headers).json()
    assert ledger["total_count"] == 1
    assert ledger["transactions"][0]["transaction_type"] == "DAILY_STIPEND"
    assert ledger["transactions"][0]["description"] == "Daily LACES stipend"


def test_grant_requires_admin(client, make_user, auth_headers):
    user = make_user(laces_balance=100)
    payload = {"user_id": str(user.user_id), "amount": 1_000_000, "transaction_type": "ADMIN_ADD"}

    response = client.post("/v1/laces/grant", json=payload, headers=auth_headers(user))

    assert response.status_code == 403
    assert client.get("/v1/laces/balance", headers=auth_headers(user)).json()["balance"] == 100


def test_admin_can_grant(client, make_user, auth_headers):
    admin = make_user(is_admin=True)
    user = make_user(laces_balance=100)
    payload = {"user_id": str(user.user_id), "amount": 25, "transaction_type": "ADMIN_ADD"}

    response = client.post("/v1/laces/grant", json=payload, headers=auth_headers(admin))

    assert response.status_code == 200
    assert response.json()["new_balance"] == 125
