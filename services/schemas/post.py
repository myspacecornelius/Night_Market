
from pydantic import BaseModel, UUID4, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class PostType(str, Enum):
    SPOTTED = 'SPOTTED'
    STOCK_CHECK = 'STOCK_CHECK'
    LINE_UPDATE = 'LINE_UPDATE'
    GENERAL = 'GENERAL'
    HEAT_CHECK = 'HEAT_CHECK'
    INTEL_REPORT = 'INTEL_REPORT'


class Visibility(str, Enum):
    public = 'public'
    local = 'local'
    friends = 'friends'
    private = 'private'


class PostBase(BaseModel):
    post_type: PostType = PostType.GENERAL
    content_text: Optional[str] = Field(None, max_length=5000)
    media_url: Optional[str] = Field(None, max_length=500)
    tags: Optional[List[str]] = Field(None, max_length=20)
    # Optional geo tags; a plain post ignores them, a hyperlocal post requires them
    geo_tag_lat: Optional[float] = Field(None, ge=-90, le=90)
    geo_tag_long: Optional[float] = Field(None, ge=-180, le=180)
    visibility: Visibility = Visibility.public


class PostCreate(PostBase):
    pass


class HyperlocalPostCreate(PostBase):
    """A post pinned to a place: the coordinates are required."""
    geo_tag_lat: float = Field(ge=-90, le=90)
    geo_tag_long: float = Field(ge=-180, le=180)


class Post(PostBase):
    post_id: UUID4
    user_id: UUID4
    timestamp: datetime
    boost_score: int = 0
    # Pydantic v2: enable ORM mode
    model_config = ConfigDict(from_attributes=True)
