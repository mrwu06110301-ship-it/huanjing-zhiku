"""学习视频 Schema"""

from pydantic import BaseModel, Field
from datetime import datetime


class VideoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    cover_image: str = ""
    video_url: str = ""
    embed_url: str = ""
    video_type: str = "popularization"
    category_id: int | None = None
    tags: list[str] = []
    duration: str = ""
    is_public: bool = True
    is_featured: bool = False


class VideoUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    cover_image: str | None = None
    video_url: str | None = None
    embed_url: str | None = None
    video_type: str | None = None
    category_id: int | None = None
    tags: list[str] | None = None
    duration: str | None = None
    is_public: bool | None = None
    is_featured: bool | None = None


class VideoOut(BaseModel):
    id: int
    title: str
    description: str = ""
    cover_image: str = ""
    video_url: str = ""
    embed_url: str = ""
    video_type: str = "popularization"
    category_id: int | None = None
    category_name: str | None = None
    category_color: str = ""
    tags: list[str] = []
    duration: str = ""
    is_public: bool = True
    is_featured: bool = False
    view_count: int = 0
    author_name: str = ""
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
