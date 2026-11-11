
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
    password: str

class User(UserBase):
    user_id: UUID4
    # Pydantic v2: enable ORM mode
    model_config = ConfigDict(from_attributes=True)
