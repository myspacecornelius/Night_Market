
from pydantic import BaseModel, UUID4
from typing import Optional, List
from datetime import datetime
from enum import Enum

class ContentType(str, Enum):
    text = 'text'
    image = 'image'
    video = 'video'

class Visibility(str, Enum):
    public = 'public'
    local = 'local'
    friends = 'friends'

class PostBase(BaseModel):
    content_type: ContentType
    content_text: Optional[str] = None
    media_url: Optional[str] = None
    tags: Optional[List[str]] = None
    geo_tag_lat: Optional[float] = None
    geo_tag_long: Optional[float] = None
    visibility: Visibility = Visibility.public

class PostCreate(PostBase):
    user_id: UUID4

class Post(PostBase):
    post_id: UUID4
    user_id: UUID4
    timestamp: datetime

    class Config:
        orm_mode = True

