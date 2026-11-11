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


# --- ledger integrity -----------------------------------------------------------

def _ledger_rows(db_session, user):
    return (
        db_session.query(LacesLedger)
        .filter(LacesLedger.user_id == user.user_id)
        .order_by(LacesLedger.created_at, LacesLedger.balance_after)
        .all()
    )


def _make_post(db_session, author):
    from services.models.post import Post

    post = Post(user_id=author.user_id, post_type="GENERAL", content_text="boost me")
    db_session.add(post)
    db_session.commit()
    return post


def test_boost_moves_laces_in_one_step_and_records_balances(client, db_session, make_user, auth_headers):
    booster = make_user(laces_balance=100)
    author = make_user(laces_balance=100)
    post = _make_post(db_session, author)

    response = client.post(f"/v1/laces/boost-post/{post.post_id}?boost_amount=30", headers=auth_headers(booster))

    assert response.status_code == 200
    assert response.json() == {
        "success": True, "boost_amount": 30, "author_reward": 15, "new_boost_score": 30, "remaining_balance": 70,
    }
    db_session.expire_all()
    assert (booster.laces_balance, author.laces_balance, post.boost_score) == (70, 115, 30)
    assert (booster.total_boosts_sent, author.total_boosts_received) == (1, 1)
    sent, = _ledger_rows(db_session, booster)
    received, = _ledger_rows(db_session, author)
    assert (sent.amount, sent.transaction_type, sent.balance_after) == (-30, "BOOST_SENT", 70)
    assert (received.amount, received.transaction_type, received.balance_after) == (15, "BOOST_RECEIVED", 115)


def test_boost_that_cannot_be_paid_changes_nothing(client, db_session, make_user, auth_headers):
    booster = make_user(laces_balance=20)
    author = make_user(laces_balance=100)
    post = _make_post(db_session, author)

    response = client.post(f"/v1/laces/boost-post/{post.post_id}?boost_amount=50", headers=auth_headers(booster))

    assert response.status_code == 400
    db_session.expire_all()
    assert (booster.laces_balance, author.laces_balance, post.boost_score) == (20, 100, 0)
    assert _ledger_rows(db_session, booster) == [] and _ledger_rows(db_session, author) == []


def test_boost_rules(client, db_session, make_user, auth_headers):
    booster = make_user(laces_balance=100)
    author = make_user(laces_balance=100)
    post = _make_post(db_session, author)

    own = client.post(f"/v1/laces/boost-post/{post.post_id}", headers=auth_headers(author))
    assert own.status_code == 400

    missing = client.post(
        "/v1/laces/boost-post/00000000-0000-4000-8000-000000000000", headers=auth_headers(booster)
    )
    assert missing.status_code == 404

    # a 1-LACES boost rounds the author's half down to nothing: no zero-amount ledger row
    tiny = client.post(f"/v1/laces/boost-post/{post.post_id}?boost_amount=1", headers=auth_headers(booster))
    assert tiny.status_code == 200 and tiny.json()["author_reward"] == 0
    assert _ledger_rows(db_session, author) == []


def test_admin_cannot_remove_more_than_the_balance(client, db_session, make_user, auth_headers):
    admin = make_user(is_admin=True)
    user = make_user(laces_balance=50)
    headers = auth_headers(admin)

    def grant(amount, transaction_type="ADMIN_REMOVE"):
        return client.post(
            "/v1/laces/grant",
            json={"user_id": str(user.user_id), "amount": amount, "transaction_type": transaction_type},
            headers=headers,
        )

    assert grant(-100000).status_code == 400  # used to clamp the balance to 0 and record -100000
    db_session.expire_all()
    assert user.laces_balance == 50 and _ledger_rows(db_session, user) == []

    assert grant(0).status_code == 422
    assert grant(5, transaction_type="NOT_A_TYPE").status_code == 422

    assert grant(-20).status_code == 200
    db_session.expire_all()
    assert user.laces_balance == 30
    assert _ledger_rows(db_session, user)[0].balance_after == 30


def test_ledger_reports_balance_after_and_validates_filters(client, make_user, auth_headers):
    user = make_user(laces_balance=100)
    headers = auth_headers(user)
    client.post("/v1/laces/daily-stipend", headers=headers)

    ledger = client.get("/v1/laces/ledger?transaction_type=DAILY_STIPEND", headers=headers).json()
    assert ledger["transactions"][0]["balance_after"] == 200

    assert client.get("/v1/laces/ledger?transaction_type=NOPE", headers=headers).status_code == 422
    assert client.get("/v1/laces/ledger?limit=-5", headers=headers).status_code == 422


def test_stipend_resets_at_the_utc_day_boundary(client, db_session, make_user, auth_headers):
    from datetime import timedelta

    from services.core.laces import start_of_utc_day

    user = make_user(laces_balance=0)
    db_session.add(LacesLedger(
        user_id=user.user_id, amount=100, transaction_type="DAILY_STIPEND", balance_after=100,
        created_at=start_of_utc_day() - timedelta(seconds=1),
    ))
    db_session.commit()

    opportunities = client.get("/v1/laces/opportunities", headers=auth_headers(user)).json()
    assert opportunities["daily_stipend_claimed"] is False
    assert client.post("/v1/laces/daily-stipend", headers=auth_headers(user)).status_code == 200
    assert client.post("/v1/laces/daily-stipend", headers=auth_headers(user)).status_code == 400


def test_concurrent_debits_cannot_overdraw(migrated_db):
    """Two sessions spend the same 100 LACES at once: exactly one may succeed."""
    import threading
    import uuid

    from sqlalchemy.orm import Session

    from services.core.laces import InsufficientLaces, apply_laces
    from services.models.user import User

    suffix = uuid.uuid4().hex[:12]
    with Session(migrated_db) as setup:
        user = User(
            username=f"race_{suffix}", email=f"race_{suffix}@example.com", display_name="Race",
            password_hash="x", laces_balance=100,
        )
        setup.add(user)
        setup.commit()
        user_id = user.user_id

    barrier = threading.Barrier(2)
    outcomes = []

    def spend():
        with Session(migrated_db) as session:
            barrier.wait()
            try:
                apply_laces(session, user_id, -100, "PURCHASE")
                session.commit()
                outcomes.append("ok")
            except InsufficientLaces:
                session.rollback()
                outcomes.append("refused")

    threads = [threading.Thread(target=spend) for _ in range(2)]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        with Session(migrated_db) as check:
            assert sorted(outcomes) == ["ok", "refused"]
            assert check.get(User, user_id).laces_balance == 0
            rows = check.query(LacesLedger).filter(LacesLedger.user_id == user_id).all()
            assert [(row.amount, row.balance_after) for row in rows] == [(-100, 0)]
    finally:
        with Session(migrated_db) as cleanup:
            cleanup.query(LacesLedger).filter(LacesLedger.user_id == user_id).delete()
            cleanup.query(User).filter(User.user_id == user_id).delete()
            cleanup.commit()
