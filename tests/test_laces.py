import pytest
from datetime import datetime, date
from services.models.user import User
from services.models.laces import LacesLedger, TransactionType
from worker.tasks.laces_stipend import distribute_daily_stipend


def test_laces_ledger_creation(db_session):
    """Test creating a LACES ledger entry"""
    user = User(
        username="testuser",
        email="test@test.com",
        password_hash="hashed",
        laces_balance=0
    )
    db_session.add(user)
    db_session.commit()

    # Create a transaction
    transaction = LacesLedger(
        user_id=user.user_id,
        amount=10,
        transaction_type=TransactionType.DAILY_STIPEND,
        description="Test stipend",
        balance_after=10
    )

    db_session.add(transaction)
    db_session.commit()

    assert transaction.id is not None
    assert transaction.amount == 10
    assert transaction.balance_after == 10


def test_laces_balance_calculation(db_session):
    """Test that balance is correctly calculated"""
    user = User(
        username="testuser",
        email="test@test.com",
        password_hash="hashed",
        laces_balance=100
    )
    db_session.add(user)
    db_session.commit()

    # Add transaction
    user.laces_balance += 50
    transaction = LacesLedger(
        user_id=user.user_id,
        amount=50,
        transaction_type=TransactionType.POST_REWARD,
        description="Post reward",
        balance_after=user.laces_balance
    )

    db_session.add(transaction)
    db_session.commit()

    assert user.laces_balance == 150
    assert transaction.balance_after == 150


def test_negative_transaction(db_session):
    """Test spending LACES tokens"""
    user = User(
        username="testuser",
        email="test@test.com",
        password_hash="hashed",
        laces_balance=100
    )
    db_session.add(user)
    db_session.commit()

    # Spend tokens
    user.laces_balance -= 30
    transaction = LacesLedger(
        user_id=user.user_id,
        amount=-30,
        transaction_type=TransactionType.PURCHASE,
        description="Bought item",
        balance_after=user.laces_balance
    )

    db_session.add(transaction)
    db_session.commit()

    assert user.laces_balance == 70
    assert transaction.amount == -30
