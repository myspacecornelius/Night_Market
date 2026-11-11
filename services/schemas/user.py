
from datetime import datetime
from pydantic import BaseModel, UUID4, EmailStr, ConfigDict, Field
from typing import Optional

class UserBase(BaseModel):
    username: str
    email: EmailStr
    display_name: str
    avatar_url: Optional[str] = None
    is_anonymous: bool = False

class UserCreate(UserBase):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(max_length=200)

class User(UserBase):
    """A user as they see themselves: includes the e-mail address and balance."""
    user_id: UUID4
    bio: Optional[str] = None
    location: Optional[str] = None
    laces_balance: int = 0
    is_verified: bool = False
    created_at: Optional[datetime] = None
    # Pydantic v2: enable ORM mode
    model_config = ConfigDict(from_attributes=True)

class UserPublic(BaseModel):
    """What other people may see of a user: no e-mail address, no balance."""
    user_id: UUID4
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    is_verified: bool = False
    model_config = ConfigDict(from_attributes=True)
