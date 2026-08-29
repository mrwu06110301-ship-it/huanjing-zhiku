"""常用工具 Schema"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Any


class ToolOut(BaseModel):
    id: int
    name: str
    slug: str
    description: str = ""
    icon: str = ""
    tool_type: str = "model"
    category: str = ""
    config: dict[str, Any] = {}
    is_public: bool = True
    sort_order: int = 0
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ToolUpdate(BaseModel):
    """工具信息更新（全部字段可选，仅传需要改的）"""
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    icon: str | None = None
    tool_type: str | None = None
    category: str | None = None
    is_public: bool | None = None
    sort_order: int | None = None
