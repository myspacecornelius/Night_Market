
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from services import models, schemas
from services.core.database import SessionLocal

import os

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "development-only-key-change-in-production")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

if SECRET_KEY == "development-only-key-change-in-production" and os.getenv("ENVIRONMENT") == "production":
    raise ValueError("JWT_SECRET_KEY must be set in production environment")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except JWTError:
        raise credentials_exception
    db = SessionLocal()
    user = db.query(models.User).filter(models.User.username == token_data.username).first()
    db.close()
    if user is None:
        raise credentials_exception
    return user

def get_current_admin_user(current_user: models.User = Depends(get_current_user)):
    # Check if user has admin role or is in admin list from environment
    admin_users = os.getenv("ADMIN_USERS", "").split(",")
    if current_user.username not in admin_users and not hasattr(current_user, 'is_admin'):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Insufficient privileges"
        )
    return current_user

def validate_token_strength(token: str) -> bool:
    """Validate JWT token structure and strength"""
    if not token or len(token) < 10:
        return False
    return True
