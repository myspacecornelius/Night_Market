
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import uuid

from services import models, schemas
from services.core.database import get_db
from services.core.security import get_current_admin_user

router = APIRouter(
    prefix="/releases",
    tags=["releases"],
)

@router.post("/", response_model=schemas.Release, dependencies=[Depends(get_current_admin_user)])
def create_release(release: schemas.ReleaseCreate, db: Session = Depends(get_db)):
    db_release = models.Release(**release.dict())
    db.add(db_release)
    db.commit()
    db.refresh(db_release)
    return db_release

@router.patch("/{release_id}", response_model=schemas.Release, dependencies=[Depends(get_current_admin_user)])
def update_release(release_id: uuid.UUID, release: schemas.ReleaseUpdate, db: Session = Depends(get_db)):
    db_release = db.query(models.Release).filter(models.Release.release_id == release_id).first()
    if not db_release:
        raise HTTPException(status_code=404, detail="Release not found")
    
    for var, value in vars(release).items():
        setattr(db_release, var, value) if value else None

    db.add(db_release)
    db.commit()
    db.refresh(db_release)
    return db_release

@router.delete("/{release_id}", status_code=204, dependencies=[Depends(get_current_admin_user)])
def delete_release(release_id: uuid.UUID, db: Session = Depends(get_db)):
    db_release = db.query(models.Release).filter(models.Release.release_id == release_id).first()
    if not db_release:
        raise HTTPException(status_code=404, detail="Release not found")
    db.delete(db_release)
    db.commit()
    return

@router.get("/upcoming", response_model=List[schemas.Release])
def get_upcoming_releases(from_date: Optional[datetime] = None, to_date: Optional[datetime] = None, db: Session = Depends(get_db)):
    if from_date is None:
        from_date = datetime.utcnow()
    if to_date is None:
        to_date = from_date + timedelta(days=90)
    
    releases = db.query(models.Release).filter(models.Release.release_date >= from_date, models.Release.release_date <= to_date).order_by(models.Release.release_date).all()
    return releases

@router.get("/{release_id}", response_model=schemas.Release)
def get_release(release_id: str, db: Session = Depends(get_db)):
    release = db.query(models.Release).filter(models.Release.release_id == release_id).first()
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    return release
