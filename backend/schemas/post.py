
from pydantic import BaseModel, UUID4
from typing import Optional, List
from datetime import datetime
from enum import Enum


class PostType(str, Enum):
    SPOTTED = 'SPOTTED'
    STOCK_CHECK = 'STOCK_CHECK'
    LINE_UPDATE = 'LINE_UPDATE'
    GENERAL = 'GENERAL'


class Visibility(str, Enum):
    public = 'public'
    local = 'local'
    friends = 'friends'


class PostBase(BaseModel):
    post_type: PostType = PostType.GENERAL
    content_text: Optional[str] = None
    media_url: Optional[str] = None
    tags: Optional[List[str]] = None
    # Optional geo tags for creation; not persisted on Post directly
    geo_tag_lat: Optional[float] = None
    geo_tag_long: Optional[float] = None
    visibility: Visibility = Visibility.public


class PostCreate(PostBase):
    pass


class Post(PostBase):
    post_id: UUID4
    user_id: UUID4
    timestamp: datetime
    location_id: Optional[UUID4] = None
    boost_score: int = 0

    class Config:
        orm_mode = True
