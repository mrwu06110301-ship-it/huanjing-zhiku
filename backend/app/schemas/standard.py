"""方法标准 Schema"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class StandardCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    cover_image: str = ""
    std_type: str = "document"  # document / interpretation / selection_guide
    category_id: int | None = None
    tags: list[str] = []
    file_url: str = ""
    is_public: bool = True


class StandardOut(BaseModel):
    id: int
    title: str
    description: str = ""
    cover_image: str = ""
    std_type: str = "document"
    category_id: int | None = None
    category_name: str | None = None
    tags: list[str] = []
    file_url: str = ""
    is_public: bool = True
    view_count: int = 0
    download_count: int = 0
    author_name: str = ""
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
