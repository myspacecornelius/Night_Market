from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from services.core.database import get_db
from services.models.post import Post
from services.schemas.post import PostCreate, Post as PostSchema
from services.core.security import get_current_user
from services.models.user import User
import uuid
import json
from services.core.redis_client import r

router = APIRouter()

@router.post("/", response_model=PostSchema)
def create_post(post: PostCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_post = Post(**post.dict(), user_id=current_user.user_id)
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    return db_post

@router.get("/feed", response_model=List[PostSchema])
def get_user_feed(skip: int = 0, limit: int = 20, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get personalized feed for authenticated user.
    For now, returns global feed sorted by boost_score and recency.
    TODO: Implement social graph filtering when following/followers are added.
    """
    cache_key = f"user_feed:{current_user.user_id}:{skip}:{limit}"
    cached_posts = r.get(cache_key)
    if cached_posts:
        return json.loads(cached_posts)

    # Get posts sorted by boost_score (engagement) and recency
    posts = (
        db.query(Post)
        .filter(Post.visibility.in_(['public', 'pseudonymous']))  # Respect privacy
        .order_by(Post.boost_score.desc(), Post.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    posts_dict = [{
        "post_id": str(p.post_id),
        "user_id": str(p.user_id),
        "post_type": p.post_type,
        "content_text": p.content_text,
        "media_url": p.media_url,
        "tags": p.tags,
        "timestamp": p.timestamp.isoformat(),
        "visibility": p.visibility,
        "location_id": str(p.location_id) if p.location_id else None,
        "boost_score": p.boost_score,
    } for p in posts]
    r.set(cache_key, json.dumps(posts_dict), ex=60)  # Cache for 60 seconds
    return posts

@router.get("/global", response_model=List[PostSchema])
def get_global_feed(skip: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    cached_posts = r.get(f"global_feed:{skip}:{limit}")
    if cached_posts:
        return json.loads(cached_posts)

    posts = db.query(Post).order_by(Post.timestamp.desc()).offset(skip).limit(limit).all()
    # Naive caching: serialize selected fields compatible with current schema
    posts_dict = [{
        "post_id": str(p.post_id),
        "user_id": str(p.user_id),
        "post_type": p.post_type,
        "content_text": p.content_text,
        "media_url": p.media_url,
        "tags": p.tags,
        "timestamp": p.timestamp.isoformat(),
        "visibility": p.visibility,
        "location_id": str(p.location_id) if p.location_id else None,
        "boost_score": p.boost_score,
    } for p in posts]
    r.set(f"global_feed:{skip}:{limit}", json.dumps(posts_dict), ex=30) # Cache for 30 seconds
    return posts

@router.get("/user/{user_id}", response_model=List[PostSchema])
def get_posts_by_user(user_id: uuid.UUID, db: Session = Depends(get_db)):
    posts = db.query(Post).filter(Post.user_id == user_id).order_by(Post.timestamp.desc()).all()
    return posts

@router.delete("/{post_id}", status_code=204)
def delete_post(post_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.post_id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")
    db.delete(post)
    db.commit()
    return
