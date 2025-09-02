
from typing import Optional

from pydantic import BaseModel, UUID4, ConfigDict

class LikeBase(BaseModel):
    user_id: UUID4
    post_id: UUID4

class LikeCreate(LikeBase):
    pass

class Like(LikeBase):
    like_id: UUID4
    model_config = ConfigDict(from_attributes=True)

class SaveBase(BaseModel):
    user_id: UUID4
    post_id: UUID4
    board_id: Optional[UUID4] = None

class SaveCreate(SaveBase):
    pass

class Save(SaveBase):
    save_id: UUID4
    model_config = ConfigDict(from_attributes=True)

class RepostBase(BaseModel):
    user_id: UUID4
    post_id: UUID4

class RepostCreate(RepostBase):
    pass

class Repost(RepostBase):
    repost_id: UUID4
    model_config = ConfigDict(from_attributes=True)
