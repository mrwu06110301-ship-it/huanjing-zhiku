"""学习视频 Schema"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class VideoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    cover_image: str = ""
    video_url: str = ""
    video_type: str = "popularization"  # popularization / demo / discussion
    category_id: int | None = None
    tags: list[str] = []
    duration: str = ""
    is_public: bool = True


class VideoOut(BaseModel):
    id: int
    title: str
    description: str = ""
    cover_image: str = ""
    video_url: str = ""
    video_type: str = "popularization"
    category_id: int | None = None
    category_name: str | None = None
    tags: list[str] = []
    duration: str = ""
    is_public: bool = True
    view_count: int = 0
    author_name: str = ""
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
