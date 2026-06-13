"""常见问题模型"""

from sqlalchemy import String, Integer, Text, Boolean, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FAQ(Base):
    __tablename__ = "faqs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question: Mapped[str] = mapped_column(String(500), nullable=False)
    answer: Mapped[str] = mapped_column(Text, default="")
    # 类型: onsite / user_question / equipment / maintenance
    faq_type: Mapped[str] = mapped_column(String(30), default="onsite", index=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id"), nullable=True)
    tags: Mapped[str] = mapped_column(JSON, default=list)
    is_pinned: Mapped[bool] = mapped_column(default=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = mapped_column(DateTime, server_default=func.now())
    updated_at = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    author = relationship("User", lazy="noload")
    category = relationship("Category", lazy="noload")
