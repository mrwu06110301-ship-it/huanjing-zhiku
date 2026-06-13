"""方法标准模型"""

from sqlalchemy import String, Integer, Text, Boolean, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Standard(Base):
    __tablename__ = "standards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    cover_image: Mapped[str] = mapped_column(String(255), default="")
    # 类型: document / interpretation / selection_guide
    std_type: Mapped[str] = mapped_column(String(30), default="document", index=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id"), nullable=True)
    tags: Mapped[str] = mapped_column(JSON, default=list)
    file_url: Mapped[str] = mapped_column(String(500), default="")
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = mapped_column(DateTime, server_default=func.now())
    updated_at = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    author = relationship("User", lazy="noload")
    category = relationship("Category", lazy="noload")
