
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ImageContentType(str, Enum):
    """What may be uploaded. SVG is left out on purpose: it can carry scripts."""
    JPEG = "image/jpeg"
    PNG = "image/png"
    WEBP = "image/webp"
    GIF = "image/gif"


# The stored object's extension comes from the content type, never from the client's file name
IMAGE_EXTENSIONS = {
    ImageContentType.JPEG: ".jpg",
    ImageContentType.PNG: ".png",
    ImageContentType.WEBP: ".webp",
    ImageContentType.GIF: ".gif",
}


class PresignRequest(BaseModel):
    file_type: ImageContentType
    file_name: Optional[str] = Field(None, max_length=255)


class PresignedUrl(BaseModel):
    url: str
    fields: dict
    key: str  # where the object will be stored; chosen by the server
    max_bytes: int  # larger uploads are refused by the storage service
