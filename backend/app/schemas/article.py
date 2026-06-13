"""文章 Schema"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class ArticleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = ""
    summary: str = Field(default="", max_length=500)
    cover_image: str = ""
    module: str = "forum"  # forum / standard / faq
    category_id: int | None = None
    tags: list[str] = []
    is_public: bool = True


class ArticleUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    summary: str | None = None
    cover_image: str | None = None
    category_id: int | None = None
    tags: list[str] | None = None
    status: str | None = None  # pending / approved / rejected
    is_pinned: bool | None = None
    is_public: bool | None = None


class ArticleOut(BaseModel):
    id: int
    title: str
    content: str = ""
    summary: str = ""
    cover_image: str = ""
    module: str = "forum"
    category_id: int | None = None
    category_name: str | None = None
    tags: list[str] = []
    status: str = "pending"
    is_pinned: bool = False
    is_public: bool = True
    view_count: int = 0
    like_count: int = 0
    author_id: int
    author_name: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ArticleListOut(BaseModel):
    """文章列表（不含 content 字段，减少传输量）"""
    id: int
    title: str
    summary: str = ""
    cover_image: str = ""
    module: str = "forum"
    category_id: int | None = None
    category_name: str | None = None
    tags: list[str] = []
    status: str = "pending"
    is_pinned: bool = False
    view_count: int = 0
    like_count: int = 0
    author_name: str = ""
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
