from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid

# Base schemas
class BaseResponse(BaseModel):
    success: bool
    message: Optional[str] = None

# User schemas
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    display_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    bio: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=100)
    website_url: Optional[str] = Field(None, max_length=500)

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=100)
    website_url: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = Field(None, max_length=500)

class User(UserBase):
    user_id: str
    avatar_url: Optional[str] = None
    laces_balance: int
    total_posts: int
    total_boosts_sent: int
    total_boosts_received: int
    is_verified: bool
    is_active: bool
    created_at: datetime
    last_active_at: datetime

    class Config:
        from_attributes = True

# Post schemas
class PostType(str, Enum):
    SPOTTED = "SPOTTED"
    STOCK_CHECK = "STOCK_CHECK"
    LINE_UPDATE = "LINE_UPDATE"
    GENERAL = "GENERAL"
    HEAT_CHECK = "HEAT_CHECK"
    INTEL_REPORT = "INTEL_REPORT"

class PostVisibility(str, Enum):
    PUBLIC = "public"
    LOCAL = "local"
    FRIENDS = "friends"
    PRIVATE = "private"

class PostBase(BaseModel):
    post_type: PostType
    content_text: Optional[str] = Field(None, max_length=2000)
    media_url: Optional[str] = Field(None, max_length=500)
    tags: Optional[List[str]] = None
    geo_tag_lat: Optional[float] = Field(None, ge=-90, le=90)
    geo_tag_long: Optional[float] = Field(None, ge=-180, le=180)
    visibility: PostVisibility = PostVisibility.PUBLIC

class PostCreate(PostBase):
    pass

class PostUpdate(BaseModel):
    content_text: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None
    visibility: Optional[PostVisibility] = None

class Post(PostBase):
    post_id: str
    user_id: str
    boost_score: int
    view_count: int
    reply_count: int
    repost_count: int
    timestamp: datetime
    updated_at: datetime
    is_pinned: bool
    is_featured: bool
    
    class Config:
        from_attributes = True

# LACES schemas
class TransactionType(str, Enum):
    DAILY_STIPEND = "DAILY_STIPEND"
    BOOST_SENT = "BOOST_SENT"
    BOOST_RECEIVED = "BOOST_RECEIVED"
    SIGNAL_REWARD = "SIGNAL_REWARD"
    ADMIN_ADD = "ADMIN_ADD"
    ADMIN_REMOVE = "ADMIN_REMOVE"
    TRANSFER_SENT = "TRANSFER_SENT"
    TRANSFER_RECEIVED = "TRANSFER_RECEIVED"
    PURCHASE = "PURCHASE"
    REFUND = "REFUND"
    CONTEST_REWARD = "CONTEST_REWARD"

class LacesBalance(BaseModel):
    user_id: str
    balance: int
    lifetime_earned: int
    lifetime_spent: int
    rank: int
    percentile: float

class LacesTransaction(BaseModel):
    id: str
    user_id: str
    amount: int
    transaction_type: TransactionType
    description: Optional[str] = None
    related_post_id: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class LacesTransfer(BaseModel):
    recipient_user_id: str
    amount: int = Field(..., gt=0, le=1000)  # Max 1000 LACES per transfer
    description: Optional[str] = Field(None, max_length=200)

class LacesAdminAdjustment(BaseModel):
    user_id: str
    amount: int = Field(..., ge=-10000, le=10000)  # Admin can adjust up to 10k
    reason: str = Field(..., min_length=5, max_length=500)

class LacesLeaderboardEntry(BaseModel):
    user_id: str
    username: str
    display_name: str
    balance: int
    rank: int

class LacesAnalytics(BaseModel):
    timeframe: str
    total_distributed: int
    total_spent: int
    transaction_count: int
    unique_users: int
    type_breakdown: Dict[str, Dict[str, int]]

# Auth schemas
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

# Release schemas
class ReleaseBase(BaseModel):
    shoe_name: str = Field(..., min_length=1, max_length=200)
    brand: str = Field(..., min_length=1, max_length=100)
    style_code: Optional[str] = Field(None, max_length=50)
    release_date: datetime
    retail_price: Optional[float] = Field(None, gt=0)
    image_url: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=1000)

class ReleaseCreate(ReleaseBase):
    pass

class ReleaseUpdate(BaseModel):
    shoe_name: Optional[str] = Field(None, min_length=1, max_length=200)
    brand: Optional[str] = Field(None, min_length=1, max_length=100)
    style_code: Optional[str] = Field(None, max_length=50)
    release_date: Optional[datetime] = None
    retail_price: Optional[float] = Field(None, gt=0)
    image_url: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=1000)

class Release(ReleaseBase):
    release_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Hyperlocal schemas
class HyperlocalSignalCreate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius: float = Field(1.0, gt=0, le=50)  # Max 50km radius

class HyperlocalFeedResponse(BaseModel):
    posts: List[Post]
    total: int
    radius_km: float
    center_lat: float
    center_lng: float

# Error schemas
class ErrorDetail(BaseModel):
    field: Optional[str] = None
    message: str
    code: Optional[str] = None

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    details: Optional[List[ErrorDetail]] = None