import os
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from services import models
from services.core.database import get_db
from services.models.session import UserSession

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "development-only-key-change-in-production")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

if SECRET_KEY == "development-only-key-change-in-production" and os.getenv("ENVIRONMENT") == "production":
    raise ValueError("JWT_SECRET_KEY must be set in production environment")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

class TokenPair:
    """Container for access and refresh token pair"""
    def __init__(self, access_token: str, refresh_token: str, token_type: str = "bearer"):
        self.access_token = access_token
        self.refresh_token = refresh_token  
        self.token_type = token_type

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "type": "access",
        "iat": datetime.utcnow()
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token() -> str:
    """Create cryptographically secure refresh token"""
    return secrets.token_urlsafe(32)

def create_token_pair(user_id: str, username: str) -> TokenPair:
    """Create access and refresh token pair"""
    access_token = create_access_token(
        data={"sub": username, "user_id": user_id}
    )
    refresh_token = create_refresh_token()
    
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token
    )

def verify_access_token(token: str) -> dict:
    """Verify and decode access token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if username is None or token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def create_user_session(
    db: Session, 
    user_id: str, 
    refresh_token: str,
    request: Request
) -> UserSession:
    """Create a new user session with device tracking"""
    # Extract client info
    ip_address = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "unknown")
    
    # Create device fingerprint
    device_fingerprint = UserSession.create_device_fingerprint(ip_address, user_agent)
    
    # Create session
    session = UserSession(
        user_id=user_id,
        refresh_token_hash=UserSession.hash_refresh_token(refresh_token),
        device_fingerprint=device_fingerprint,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    """Get current user from access token"""
    payload = verify_access_token(token)
    username = payload.get("sub")
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Update last active time
    user.last_active_at = datetime.utcnow()
    db.commit()
    
    return user

def get_current_active_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Get current active user (not banned/disabled)"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Inactive user"
        )
    return current_user

def get_current_admin_user(current_user: models.User = Depends(get_current_active_user)) -> models.User:
    """Get current admin user"""
    if not current_user.is_admin:
        admin_users = os.getenv("ADMIN_USERS", "").split(",")
        if current_user.username not in admin_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Insufficient privileges"
            )
    return current_user

def validate_refresh_token(db: Session, refresh_token: str) -> Optional[UserSession]:
    """Validate refresh token and return associated session"""
    token_hash = UserSession.hash_refresh_token(refresh_token)
    
    session = db.query(UserSession).filter(
        UserSession.refresh_token_hash == token_hash,
        UserSession.is_revoked == '0'
    ).first()
    
    if not session or session.is_expired():
        return None
    
    # Update last used time
    session.last_used_at = datetime.utcnow()
    db.commit()
    
    return session

def revoke_user_sessions(db: Session, user_id: str, reason: str = "security"):
    """Revoke all sessions for a user"""
    sessions = db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.is_revoked == '0'
    ).all()
    
    for session in sessions:
        session.revoke(reason)
    
    db.commit()
    return len(sessions)

def cleanup_expired_sessions(db: Session) -> int:
    """Clean up expired sessions (run periodically)"""
    expired_sessions = db.query(UserSession).filter(
        UserSession.expires_at < datetime.utcnow(),
        UserSession.is_revoked == '0'
    ).all()
    
    for session in expired_sessions:
        session.revoke("expired")
    
    db.commit()
    return len(expired_sessions)