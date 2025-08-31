
from pydantic import BaseModel

class PresignedUrl(BaseModel):
    url: str
    fields: dict
