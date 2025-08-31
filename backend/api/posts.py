from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.core.database import get_db
from backend.models.post import Post
from backend.schemas.post import PostCreate, Post as PostSchema
from backend.core.security import get_current_user
from backend.models.user import User
import uuid
import json
from backend.core.redis_client import r

router = APIRouter()

@router.post("/", response_model=PostSchema)
def create_post(post: PostCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_post = Post(**post.dict(), user_id=current_user.user_id)
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    return db_post

@router.get("/global", response_model=List[PostSchema])
def get_global_feed(skip: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    cached_posts = r.get(f"global_feed:{skip}:{limit}")
    if cached_posts:
        return json.loads(cached_posts)

    posts = db.query(Post).order_by(Post.timestamp.desc()).offset(skip).limit(limit).all()
    # This is a naive caching implementation. A better approach would be to use a proper serialization library.
    posts_dict = [{"post_id": str(p.post_id), "user_id": str(p.user_id), "content_type": p.content_type, "content_text": p.content_text, "media_url": p.media_url, "tags": p.tags, "geo_tag_lat": p.geo_tag_lat, "geo_tag_long": p.geo_tag_long, "timestamp": p.timestamp.isoformat(), "visibility": p.visibility} for p in posts]
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

