from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from services.database import get_db
from services.core import auth, locations, laces, feed
from services.schemas import post as post_schemas
from services.schemas import user as user_schemas
from services.models import user as user_models

router = APIRouter()


@router.post("/hyperlocal/signals", response_model=post_schemas.Post)
def create_signal(
    signal: post_schemas.HyperlocalPostCreate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(auth.get_current_active_user),
):
    """
    Create a new hyperlocal signal: a post pinned to a location.
    """
    return locations.create_location_and_post(db=db, post_create=signal, user_id=current_user.user_id)


@router.get("/feed/scan", response_model=List[post_schemas.Post])
def get_local_feed(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius: float = Query(1.0, gt=0, le=100, description="Radius in kilometers"),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(auth.get_current_active_user),
):
    """
    Fetch hyperlocal feed based on user's location.
    """
    return feed.get_hyperlocal_feed(db=db, latitude=latitude, longitude=longitude, radius=radius)


@router.post("/hyperlocal/signals/{post_id}/boost", response_model=user_schemas.User)
def boost_signal(
    post_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(auth.get_current_active_user),
):
    """
    Boost a hyperlocal signal with the default amount of LACES.
    """
    try:
        laces.boost_post(db, post_id, current_user.user_id)
    except LookupError as error:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error.args[0]))
    except laces.LacesError as error:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))
    db.commit()
    db.refresh(current_user)
    return current_user
