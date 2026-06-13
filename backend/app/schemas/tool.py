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
