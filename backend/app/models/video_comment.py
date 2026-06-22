"""视频评论模型"""

from sqlalchemy import Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VideoComment(Base):
    __tablename__ = "video_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    video_id: Mapped[int] = mapped_column(Integer, ForeignKey("videos.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    parent_id: Mapped[int] = mapped_column(Integer, ForeignKey("video_comments.id"), nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())

    author = relationship("User", lazy="noload")
    video = relationship("Video", lazy="noload")
