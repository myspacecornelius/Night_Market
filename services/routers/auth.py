from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from services import models, schemas
from services.database import get_db
from services.core.security import DUMMY_PASSWORD_HASH, verify_password
from services.core.auth import (
    get_current_active_user,
    claim_refresh_session,
    issue_tokens,
    revoke_user_sessions
)
from services.routers.users import register_user
from services.schemas.user import UserCreate

router = APIRouter(tags=["auth"])


def _token_response(token_pair) -> schemas.TokenPair:
    return schemas.TokenPair(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        token_type=token_pair.token_type
    )


@router.post("/register", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """Create an account (same as POST /users/)."""
    return register_user(user, db)

@router.post("/token", response_model=schemas.TokenPair)
def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    """Log in with a username or e-mail address and password."""
    identifier = form_data.username.strip()
    user = db.query(models.User).filter(
        or_(
            func.lower(models.User.username) == identifier.lower(),
            func.lower(models.User.email) == identifier.lower(),
        )
    ).first()
    # Always run one bcrypt verification, so an unknown account takes as long to reject
    # as a wrong password and response time does not reveal which usernames exist.
    password_ok = verify_password(form_data.password, user.password_hash if user else DUMMY_PASSWORD_HASH)
    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return _token_response(issue_tokens(db, user, request))

@router.post("/refresh", response_model=schemas.TokenPair)
def refresh_access_token(
    request: Request,
    refresh_request: schemas.RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """Exchange a refresh token for a new token pair. The old pair stops working."""
    # Claiming the token also revokes its session, so it cannot be exchanged twice
    session = claim_refresh_session(db, refresh_request.refresh_token)
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    # Get user
    user = db.query(models.User).filter(models.User.user_id == session.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    return _token_response(issue_tokens(db, user, request))

@router.post("/logout")
def logout(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Logout user and revoke all sessions"""
    revoked_count = revoke_user_sessions(db, str(current_user.user_id), "logout")
    
    return {
        "message": "Successfully logged out",
        "sessions_revoked": revoked_count
    }

@router.get("/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_active_user)):
    """Get current user profile"""
    return current_user
