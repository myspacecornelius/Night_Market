from celery import shared_task
from datetime import datetime, date
from sqlalchemy import and_, func
from services.database import SessionLocal
from services.models.user import User
from services.models.laces import LacesLedger, TransactionType


@shared_task(name="tasks.daily_laces_stipend")
def distribute_daily_stipend():
    """
    Distribute daily LACES stipend to all active users.
    Runs once per day via Celery Beat.
    """
    db = SessionLocal()
    try:
        today = date.today()
        stipend_amount = 10  # Base daily stipend

        # Get all active users
        users = db.query(User).filter(User.is_active == True).all()

        processed_count = 0
        skipped_count = 0

        for user in users:
            # Check if user already received stipend today
            existing_stipend = db.query(LacesLedger).filter(
                and_(
                    LacesLedger.user_id == user.user_id,
                    LacesLedger.transaction_type == TransactionType.DAILY_STIPEND,
                    func.date(LacesLedger.created_at) == today
                )
            ).first()

            if existing_stipend:
                skipped_count += 1
                continue

            # Create stipend transaction
            transaction = LacesLedger(
                user_id=user.user_id,
                amount=stipend_amount,
                transaction_type=TransactionType.DAILY_STIPEND,
                description=f"Daily stipend for {today}",
                balance_after=user.laces_balance + stipend_amount
            )

            # Update user balance
            user.laces_balance += stipend_amount

            db.add(transaction)
            processed_count += 1

        db.commit()

        return {
            "status": "success",
            "processed": processed_count,
            "skipped": skipped_count,
            "total_users": len(users),
            "date": str(today)
        }

    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


@shared_task(name="tasks.reward_post_creation")
def reward_post_creation(user_id: str, post_id: str):
    """
    Reward user with LACES tokens for creating a post.
    Called when a new post is created.
    """
    db = SessionLocal()
    try:
        reward_amount = 5  # Base reward for post creation

        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return {"status": "error", "message": "User not found"}

        # Create reward transaction
        transaction = LacesLedger(
            user_id=user_id,
            amount=reward_amount,
            transaction_type=TransactionType.POST_REWARD,
            description=f"Reward for creating post {post_id}",
            related_post_id=post_id,
            balance_after=user.laces_balance + reward_amount
        )

        # Update user balance
        user.laces_balance += reward_amount

        db.add(transaction)
        db.commit()

        return {
            "status": "success",
            "user_id": user_id,
            "amount": reward_amount,
            "new_balance": user.laces_balance
        }

    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


@shared_task(name="tasks.reward_checkin")
def reward_checkin(user_id: str, dropzone_id: str, streak_count: int):
    """
    Reward user with LACES tokens for checking in to a dropzone.
    Bonus points for streaks.
    """
    db = SessionLocal()
    try:
        base_reward = 3
        streak_bonus = min(streak_count - 1, 10) * 2  # Max 20 bonus
        total_reward = base_reward + streak_bonus

        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return {"status": "error", "message": "User not found"}

        # Create reward transaction
        transaction = LacesLedger(
            user_id=user_id,
            amount=total_reward,
            transaction_type=TransactionType.CHECKIN_REWARD,
            description=f"Check-in reward (streak: {streak_count})",
            balance_after=user.laces_balance + total_reward
        )

        # Update user balance
        user.laces_balance += total_reward

        db.add(transaction)
        db.commit()

        return {
            "status": "success",
            "user_id": user_id,
            "amount": total_reward,
            "streak_count": streak_count,
            "new_balance": user.laces_balance
        }

    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
