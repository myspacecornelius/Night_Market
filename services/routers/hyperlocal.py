
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from services.core.database import get_db
from services.core import security, locations, laces, feed
from services.schemas import post as post_schemas
from services.schemas import user as user_schemas
from services.models import user as user_models

router = APIRouter()

@router.post("/signals", response_model=post_schemas.Post)
def create_signal(
    signal: post_schemas.PostCreate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(security.get_current_user),
):
    """
    Create a new hyperlocal signal (post).
    """
    db_post = locations.create_location_and_post(db=db, post_create=signal, user_id=current_user.user_id)
    return db_post

@router.get("/feed/scan", response_model=List[post_schemas.Post])
def get_local_feed(
    latitude: float,
    longitude: float,
    radius: float = 1.0, # in kilometers
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(security.get_current_user),
):
    """
    Fetch hyperlocal feed based on user's location.
    """
    posts = feed.get_hyperlocal_feed(db=db, latitude=latitude, longitude=longitude, radius=radius)
    return posts

@router.post("/signals/{post_id}/boost", response_model=user_schemas.User)
def boost_signal(
    post_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(security.get_current_user),
):
    """
    Boost a signal using Laces.
    """
    try:
        updated_user = laces.boost_post(db=db, post_id=post_id, user_id=current_user.user_id)
        return updated_user
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
