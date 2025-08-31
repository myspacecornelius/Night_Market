
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models import user as user_models
from backend.models import laces as laces_models
from backend.models import post as post_models

# Define the cost of boosting a signal
BOOST_COST = 10 # Example: 10 Laces per boost

def boost_post(
    db: Session,
    post_id: int,
    user_id: int,
):
    user = db.query(user_models.User).filter(user_models.User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    if user.laces_balance < BOOST_COST:
        raise ValueError("Insufficient Laces balance")

    post = db.query(post_models.Post).filter(post_models.Post.id == post_id).first()
    if not post:
        raise ValueError("Post not found")

    # Deduct Laces from user
    user.laces_balance -= BOOST_COST

    # Record the transaction in the LacesLedger
    ledger_entry = laces_models.LacesLedger(
        user_id=user_id,
        post_id=post_id,
        amount=-BOOST_COST, # Negative for deduction
        transaction_type="boost",
    )
    db.add(ledger_entry)

    # Increase the post's boost_score
    post.boost_score = func.coalesce(post.boost_score, 0) + 1

    db.commit()
    db.refresh(user)
    db.refresh(post)

    return user

def add_laces_to_user(
    db: Session,
    user_id: int,
    amount: int,
    transaction_type: str = "admin_add",
):
    user = db.query(user_models.User).filter(user_models.User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    user.laces_balance += amount

    ledger_entry = laces_models.LacesLedger(
        user_id=user_id,
        amount=amount,
        transaction_type=transaction_type,
    )
    db.add(ledger_entry)

    db.commit()
    db.refresh(user)

    return user
