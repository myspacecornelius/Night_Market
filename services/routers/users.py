from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List
from services.core.auth import get_current_active_user
from services.database import get_db
from services.core.password import PasswordPolicy
from services.core.security import get_password_hash
from services.models.user import User
from services.schemas.user import UserCreate, User as UserSchema, UserPublic, UserUpdate

router = APIRouter()


def register_user(user: UserCreate, db: Session) -> User:
    """Create an account. Raises 409 when the username or e-mail is taken."""
    email = user.email.lower()
    existing = db.query(User).filter(or_(func.lower(User.email) == email, func.lower(User.username) == user.username.lower())).first()
    if existing:
        taken = "Email" if existing.email.lower() == email else "Username"
        raise HTTPException(status_code=409, detail=f"{taken} already registered")

    is_valid, message = PasswordPolicy.validate(user.password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=message)

    db_user = User(
        email=email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        is_anonymous=user.is_anonymous,
        password_hash=get_password_hash(user.password),
    )
    db.add(db_user)
    try:
        db.commit()
    except IntegrityError:
        # Lost a race with another registration for the same name or address
        db.rollback()
        raise HTTPException(status_code=409, detail="Username or email already registered")
    db.refresh(db_user)
    return db_user


@router.post("/", response_model=UserSchema)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    return register_user(user, db)

@router.get("/", response_model=List[UserPublic], dependencies=[Depends(get_current_active_user)])
def get_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return (
        db.query(User)
        .filter(User.is_active.is_(True), User.is_anonymous.is_(False))
        .order_by(User.username)
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.patch("/me", response_model=UserSchema)
def update_me(
    changes: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Change the signed-in user's own profile. Only the fields that were sent change.

    The body can only name the fields of UserUpdate; the account's username, e-mail
    address, role, status and balance cannot be changed here.
    """
    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user
