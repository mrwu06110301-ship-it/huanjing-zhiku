"""评论模型"""

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    article_id: Mapped[int] = mapped_column(Integer, ForeignKey("articles.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    parent_id: Mapped[int] = mapped_column(Integer, ForeignKey("comments.id"), nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())

    # 关联
    author = relationship("User", back_populates="comments", lazy="noload")
    article = relationship("Article", back_populates="comments", lazy="noload")
