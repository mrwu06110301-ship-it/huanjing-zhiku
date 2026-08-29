"""学习视频模型"""

from datetime import datetime
from sqlalchemy import String, Integer, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    cover_image: Mapped[str] = mapped_column(String(255), default="")
    video_url: Mapped[str] = mapped_column(String(500), default="")
    embed_url: Mapped[str] = mapped_column(String(500), default="")  # 嵌入播放地址（B站等）
    # 类型: popularization / demo / discussion
    video_type: Mapped[str] = mapped_column(String(30), default="popularization", index=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id"), nullable=True)
    tags: Mapped[str] = mapped_column(JSON, default=list)
    duration: Mapped[str] = mapped_column(String(20), default="")  # e.g. "12:30"
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)  # 轮播推荐
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = mapped_column(DateTime, default=datetime.now)
    updated_at = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    author = relationship("User", lazy="noload")
    category = relationship("Category", lazy="noload")
