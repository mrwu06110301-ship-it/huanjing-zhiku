"""分类 Schema"""

from pydantic import BaseModel
from datetime import datetime


class CategoryCreate(BaseModel):
    module: str  # forum / video / standard / faq / tool
    name: str
    slug: str
    description: str = ""
    color: str = ""
    parent_id: int | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    module: str | None = None
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    color: str | None = None
    parent_id: int | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class CategoryOut(BaseModel):
    id: int
    module: str
    name: str
    slug: str
    description: str = ""
    color: str = ""
    parent_id: int | None = None
    sort_order: int = 0
    is_active: bool = True
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
