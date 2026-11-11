
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import uuid

from services import models, schemas
from services.database import get_db
from services.core.auth import get_current_admin_user

router = APIRouter(
    prefix="/releases",
    tags=["releases"],
)

@router.post("/", response_model=schemas.Release, dependencies=[Depends(get_current_admin_user)])
def create_release(release: schemas.ReleaseCreate, db: Session = Depends(get_db)):
    db_release = models.Release(**release.model_dump())
    db.add(db_release)
    db.commit()
    db.refresh(db_release)
    return db_release

@router.patch("/{release_id}", response_model=schemas.Release, dependencies=[Depends(get_current_admin_user)])
def update_release(release_id: uuid.UUID, release: schemas.ReleaseUpdate, db: Session = Depends(get_db)):
    db_release = db.query(models.Release).filter(models.Release.release_id == release_id).first()
    if not db_release:
        raise HTTPException(status_code=404, detail="Release not found")
    
    # Only what the client sent, so one field can change on its own and falsy
    # values (a price of 0, empty or null store_links) are applied, not skipped.
    for field, value in release.model_dump(exclude_unset=True).items():
        setattr(db_release, field, value)

    db.add(db_release)
    db.commit()
    db.refresh(db_release)
    return db_release

@router.delete("/{release_id}", status_code=204, dependencies=[Depends(get_current_admin_user)])
def delete_release(release_id: uuid.UUID, db: Session = Depends(get_db)):
    # The row lock keeps a subscription from being added to the release while it is removed.
    db_release = db.query(models.Release).filter(models.Release.release_id == release_id).with_for_update().first()
    if not db_release:
        raise HTTPException(status_code=404, detail="Release not found")
    # subscriptions.release_id has no ON DELETE rule, so the subscriptions to this
    # release go first, in the same transaction; they have nothing left to follow.
    db.query(models.Subscription).filter(models.Subscription.release_id == release_id).delete(synchronize_session=False)
    db.delete(db_release)
    db.commit()
    return

@router.get("/", response_model=List[schemas.Release])
def list_releases(
    skip: int = Query(0, ge=0, le=1_000_000),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Every release, latest release date first. Public, like the other release reads."""
    return (
        db.query(models.Release)
        .order_by(models.Release.release_date.desc(), models.Release.release_id)
        .offset(skip)
        .limit(limit)
        .all()
    )

@router.get("/upcoming", response_model=List[schemas.Release])
def get_upcoming_releases(from_date: Optional[datetime] = None, to_date: Optional[datetime] = None, db: Session = Depends(get_db)):
    if from_date is None:
        from_date = datetime.now(timezone.utc)
    if to_date is None:
        try:
            to_date = from_date + timedelta(days=90)
        except OverflowError:  # from_date within 90 days of the last representable date
            to_date = datetime.max.replace(tzinfo=from_date.tzinfo)
    
    releases = db.query(models.Release).filter(models.Release.release_date >= from_date, models.Release.release_date <= to_date).order_by(models.Release.release_date).all()
    return releases

@router.get("/{release_id}", response_model=schemas.Release)
def get_release(release_id: uuid.UUID, db: Session = Depends(get_db)):
    release = db.query(models.Release).filter(models.Release.release_id == release_id).first()
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    return release
