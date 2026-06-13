"""文章/帖子模型 — 覆盖论坛帖子、标准解读等"""

from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(String(500), default="")
    cover_image: Mapped[str] = mapped_column(String(255), default="")
    # 模块: forum / standard / faq
    module: Mapped[str] = mapped_column(String(20), default="forum", index=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id"), nullable=True)
    tags: Mapped[str] = mapped_column(JSON, default=list)  # ["Python", "FastAPI"]
    # 审核状态: pending / approved / rejected
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = mapped_column(DateTime, server_default=func.now())
    updated_at = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # 关联 — 使用 noload 避免异步 MissingGreenlet 错误，关联数据在路由中手动查询
    author = relationship("User", back_populates="articles", lazy="noload")
    category = relationship("Category", back_populates="articles", lazy="noload")
    comments = relationship("Comment", back_populates="article", lazy="noload", cascade="all, delete-orphan")
