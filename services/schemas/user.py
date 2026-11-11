
from datetime import datetime
from urllib.parse import urlsplit

from pydantic import BaseModel, UUID4, EmailStr, ConfigDict, Field, StrictBool, field_validator
from pydantic_core import PydanticCustomError
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
    website_url: Optional[str] = None
    laces_balance: int = 0
    is_verified: bool = False
    created_at: Optional[datetime] = None
    # Pydantic v2: enable ORM mode
    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """Body of PATCH /users/me: the profile fields a user may change about themselves.

    Every field is optional and only the ones sent are changed. Anything else (username,
    email, is_admin, is_active, is_verified, laces_balance, ...) is rejected rather than
    ignored, so a client can never believe it changed something it did not.

    Text is trimmed. For the optional texts (bio, location, website_url, avatar_url) null
    or blank clears the value; display_name and is_anonymous cannot be null.
    """
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=100)
    website_url: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = Field(None, max_length=500)
    # Strict: "yes", 1 or "true" are not booleans here
    is_anonymous: Optional[StrictBool] = None

    @field_validator("display_name", "is_anonymous")
    @classmethod
    def _required_when_sent(cls, value):
        # Leaving the field out keeps the current value; an explicit null has no meaning
        if value is None:
            raise PydanticCustomError("null_not_allowed", "This field cannot be null")
        return value

    @field_validator("display_name", "bio", "location", "website_url", "avatar_url")
    @classmethod
    def _storable_text(cls, value: Optional[str]) -> Optional[str]:
        # PostgreSQL text cannot hold NUL bytes
        if value is not None and "\x00" in value:
            raise PydanticCustomError("nul_byte", "Text must not contain NUL bytes")
        return value

    @field_validator("bio", "location", "website_url", "avatar_url")
    @classmethod
    def _blank_clears(cls, value: Optional[str]) -> Optional[str]:
        return value or None

    @field_validator("website_url", "avatar_url")
    @classmethod
    def _http_url(cls, value: Optional[str]) -> Optional[str]:
        # These are rendered as a link and an image source, so only web addresses are
        # accepted: no javascript:, data: or scheme-less values.
        if value is None:
            return None
        if any(char.isspace() or ord(char) < 0x20 or ord(char) == 0x7F for char in value):
            raise PydanticCustomError("http_url", "URL must not contain spaces or control characters")
        try:
            parts = urlsplit(value)
            host = parts.hostname
        except ValueError:
            parts, host = None, None
        if parts is None or parts.scheme.lower() not in ("http", "https") or not host:
            raise PydanticCustomError("http_url", "URL must start with http:// or https://")
        return value


class UserPublic(BaseModel):
    """What other people may see of a user: no e-mail address, no balance."""
    user_id: UUID4
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    is_verified: bool = False
    model_config = ConfigDict(from_attributes=True)
