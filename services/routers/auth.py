
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from services import models, schemas
from services.core.database import get_db
from services.core.security import verify_password
from services.core.auth import (
    create_token_pair, 
    create_user_session,
    get_current_user,
    get_current_active_user, 
    validate_refresh_token,
    revoke_user_sessions
)

router = APIRouter(tags=["auth"])

@router.post("/token", response_model=schemas.TokenPair)
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    """Enhanced login with refresh token support"""
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Create token pair
    token_pair = create_token_pair(str(user.user_id), user.username)
    
    # Create session for refresh token tracking
    create_user_session(db, str(user.user_id), token_pair.refresh_token, request)
    
    return schemas.TokenPair(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        token_type=token_pair.token_type
    )

@router.post("/refresh", response_model=schemas.TokenPair)
async def refresh_access_token(
    request: Request,
    refresh_request: schemas.RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """Refresh access token using refresh token"""
    session = validate_refresh_token(db, refresh_request.refresh_token)
    
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
    
    # Revoke old session and create new token pair
    session.revoke("refresh")
    db.commit()
    
    # Create new token pair
    token_pair = create_token_pair(str(user.user_id), user.username)
    
    # Create new session
    create_user_session(db, str(user.user_id), token_pair.refresh_token, request)
    
    return schemas.TokenPair(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        token_type=token_pair.token_type
    )

@router.post("/logout")
async def logout(
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
async def read_users_me(current_user: models.User = Depends(get_current_active_user)):
    """Get current user profile"""
    return current_user
