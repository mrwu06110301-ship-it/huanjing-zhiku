"""常见问题 Schema"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class FAQCreate(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    answer: str = ""
    faq_type: str = "onsite"  # onsite / user_question / equipment / maintenance
    category_id: int | None = None
    tags: list[str] = []
    is_pinned: bool = False


class FAQOut(BaseModel):
    id: int
    question: str
    answer: str = ""
    faq_type: str = "onsite"
    category_id: int | None = None
    category_name: str | None = None
    tags: list[str] = []
    is_pinned: bool = False
    is_public: bool = True
    view_count: int = 0
    author_name: str = ""
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
