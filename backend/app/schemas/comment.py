"""评论 Schema"""

from pydantic import BaseModel
from datetime import datetime


class CommentCreate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: int
    content: str
    article_id: int
    author_id: int
    author_name: str = ""
    parent_id: int | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
