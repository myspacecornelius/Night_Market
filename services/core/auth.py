import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import update
from sqlalchemy.orm import Session

from services import models
from services.core.security import ALGORITHM, SECRET_KEY
from services.database import get_db
from services.models.session import UserSession

# JWT Configuration (the secret is read and validated in core.security)
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
# Two tabs of one browser can send the same refresh token moments apart; only a replay
# later than this is treated as a copied token.
REFRESH_REUSE_GRACE_SECONDS = 10

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)

class TokenPair:
    """Container for access and refresh token pair"""
    def __init__(self, access_token: str, refresh_token: str, token_type: str = "bearer"):
        self.access_token = access_token
        self.refresh_token = refresh_token  
        self.token_type = token_type

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

    to_encode.update({
        "exp": expire,
        "type": "access",
        "iat": now
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token() -> str:
    """Create cryptographically secure refresh token"""
    return secrets.token_urlsafe(32)

def issue_tokens(db: Session, user: models.User, request: Request) -> TokenPair:
    """Start a session for the user and return its access and refresh tokens.

    The access token carries the session id (``sid``), so revoking the session
    (logout, refresh rotation) also ends the access token instead of leaving it
    valid until it expires.
    """
    refresh_token = create_refresh_token()
    session = create_user_session(db, str(user.user_id), refresh_token, request)
    access_token = create_access_token(
        data={"sub": user.username, "user_id": str(user.user_id), "sid": str(session.id)}
    )
    return TokenPair(access_token=access_token, refresh_token=refresh_token)

def verify_access_token(token: str) -> dict:
    """Verify and decode access token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"require_exp": True})
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
    # Extract client info, trimmed to the column sizes
    ip_address = (request.client.host if request.client else "unknown")[:45]
    user_agent = request.headers.get("User-Agent", "unknown")[:500]
    
    # Create device fingerprint
    device_fingerprint = UserSession.create_device_fingerprint(ip_address, user_agent)
    
    # Create session
    session = UserSession(
        user_id=user_id,
        refresh_token_hash=UserSession.hash_refresh_token(refresh_token),
        device_fingerprint=device_fingerprint,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session

def _user_for_token(db: Session, payload: dict) -> Optional[models.User]:
    """The account a verified token belongs to, or None if it no longer applies.

    The user is found by the immutable ``user_id`` claim (a username can be freed and
    registered again by someone else); tokens without it fall back to ``sub``. A token
    issued for a login session stops working once that session is revoked or expired.
    """
    user = None
    user_id = payload.get("user_id")
    if user_id is not None:
        try:
            user = db.get(models.User, uuid.UUID(str(user_id)))
        except ValueError:
            return None
        if user is not None and user.username != payload.get("sub"):
            return None
    else:
        user = db.query(models.User).filter(models.User.username == payload.get("sub")).first()
    if user is None:
        return None

    session_id = payload.get("sid")
    if session_id is not None:
        try:
            session = db.get(UserSession, uuid.UUID(str(session_id)))
        except ValueError:
            return None
        if session is None or session.user_id != user.user_id or not session.is_active():
            return None
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    """Get current user from access token"""
    user = _user_for_token(db, verify_access_token(token))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Update last active time
    user.last_active_at = datetime.now(timezone.utc)
    db.commit()
    
    return user

def get_optional_user(
    token: Optional[str] = Depends(optional_oauth2_scheme), db: Session = Depends(get_db)
) -> Optional[models.User]:
    """The caller if they sent a valid token for an active account, otherwise None."""
    if not token:
        return None
    try:
        payload = verify_access_token(token)
    except HTTPException:
        return None
    user = _user_for_token(db, payload)
    return user if user is not None and user.is_active else None


def get_current_active_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Get current active user (not banned/disabled)"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user

def get_current_admin_user(current_user: models.User = Depends(get_current_active_user)) -> models.User:
    """Get current admin user.

    Admin rights come only from users.is_admin (see services/admin/promote.py). They used
    to be granted to any username listed in ADMIN_USERS as well, which let anyone register
    a listed name that was still free and become an admin.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges"
        )
    return current_user

def claim_refresh_session(db: Session, refresh_token: str) -> Optional[UserSession]:
    """Use up a refresh token: end its session and return it, or None if it is not usable.

    Checking and revoking are one conditional UPDATE, so when the same token arrives
    several times at once exactly one request gets the session (they used to all get
    a new token pair).

    A token that was exchanged earlier and turns up again was probably copied. Which
    of the two holders is the real one cannot be told, so every session of that
    account is ended and the owner signs in again.
    """
    token_hash = UserSession.hash_refresh_token(refresh_token)
    now = datetime.now(timezone.utc)

    claimed_id = db.execute(
        update(UserSession)
        .where(
            UserSession.refresh_token_hash == token_hash,
            UserSession.is_revoked == '0',
            UserSession.expires_at > now,
        )
        .values(is_revoked='1', revoked_reason='refresh', last_used_at=now)
        .returning(UserSession.id)
    ).scalar_one_or_none()
    db.commit()
    if claimed_id is not None:
        return db.get(UserSession, claimed_id)

    replayed = db.query(UserSession).filter(
        UserSession.refresh_token_hash == token_hash,
        UserSession.revoked_reason == 'refresh',
        UserSession.expires_at > now,
    ).first()
    if (
        replayed is not None
        and replayed.last_used_at is not None
        and now - replayed.last_used_at > timedelta(seconds=REFRESH_REUSE_GRACE_SECONDS)
    ):
        revoke_user_sessions(db, replayed.user_id, "refresh_reuse")
    return None

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
        UserSession.expires_at < datetime.now(timezone.utc),
        UserSession.is_revoked == '0'
    ).all()
    
    for session in expired_sessions:
        session.revoke("expired")
    
    db.commit()
    return len(expired_sessions)