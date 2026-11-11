from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from services.database import get_db
from services.models.post import Post
from services.schemas.post import PostCreate, Post as PostSchema
from services.core.auth import get_current_active_user as get_current_user, get_optional_user
from services.models.user import User
import uuid
import json
import logging

import redis

from services.core.feed_cache import feed_version as _feed_version, invalidate_feeds as _invalidate_feeds
from services.core.metrics import POSTS_CREATED
from services.core.redis_client import r

logger = logging.getLogger(__name__)

router = APIRouter()


def _cached_feed(key: str, ttl: int, load) -> list:
    """Serve a feed page from Redis, falling back to (and caching) the database result."""
    version = _feed_version()
    cache_key = f"{key}:v{version}" if version is not None else None
    if cache_key:
        try:
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached)
        except redis.RedisError as error:
            logger.warning("Feed cache read failed: %s", error)

    payload = [PostSchema.model_validate(post).model_dump(mode="json") for post in load()]

    if cache_key:
        try:
            r.set(cache_key, json.dumps(payload), ex=ttl)
        except redis.RedisError as error:
            logger.warning("Feed cache write failed: %s", error)
    return payload


@router.post("/", response_model=PostSchema)
def create_post(post: PostCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # geo tags only apply to hyperlocal signals; a plain post has no location
    data = post.model_dump(exclude={"geo_tag_lat", "geo_tag_long"})
    data["post_type"] = post.post_type.value
    data["visibility"] = post.visibility.value
    db_post = Post(**data, user_id=current_user.user_id)
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    _invalidate_feeds()
    POSTS_CREATED.labels("post").inc()
    return db_post

@router.get("/feed", response_model=List[PostSchema])
def get_user_feed(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get personalized feed for authenticated user.
    For now, returns global feed sorted by boost_score and recency.
    TODO: Implement social graph filtering when following/followers are added.
    """
    def load():
        return (
            db.query(Post)
            .options(selectinload(Post.location))
            .filter(Post.visibility == 'public', Post.is_archived.is_(False))  # Respect privacy
            .order_by(Post.boost_score.desc(), Post.timestamp.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    return _cached_feed(f"user_feed:{current_user.user_id}:{skip}:{limit}", 60, load)

@router.get("/global", response_model=List[PostSchema])
def get_global_feed(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    def load():
        return (
            db.query(Post)
            .options(selectinload(Post.location))
            .filter(Post.visibility == 'public', Post.is_archived.is_(False))
            .order_by(Post.timestamp.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    return _cached_feed(f"global_feed:{skip}:{limit}", 30, load)

@router.get("/user/{user_id}", response_model=List[PostSchema])
def get_posts_by_user(
    user_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    """A user's posts. Only the author sees their own non-public posts."""
    query = db.query(Post).options(selectinload(Post.location)).filter(Post.user_id == user_id)
    if viewer is None or viewer.user_id != user_id:
        query = query.filter(Post.visibility == 'public', Post.is_archived.is_(False))
    return query.order_by(Post.timestamp.desc()).offset(skip).limit(limit).all()

@router.delete("/{post_id}", status_code=204)
def delete_post(post_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.post_id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")
    db.delete(post)
    db.commit()
    _invalidate_feeds()
    return
