"""留言模型 — 用户留言，需审核后公开，支持点赞和回复"""

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    contact: Mapped[str] = mapped_column(String(100), default="")  # 联系方式（可选）
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)  # 未登录用户可为空

    # 审核状态
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending / approved / rejected

    # 互动
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    like_users: Mapped[str] = mapped_column(Text, default="[]")  # JSON: 点赞用户ID列表

    # 管理员回复（审核时附带）
    reply: Mapped[str] = mapped_column(Text, default="")

    # 父留言ID（用于回复链）
    parent_id: Mapped[int] = mapped_column(Integer, ForeignKey("messages.id"), nullable=True)

    is_read: Mapped[bool] = mapped_column(default=False)
    created_at = mapped_column(DateTime, server_default=func.now())

    author = relationship("User", lazy="noload")
    replies = relationship("Message", backref="parent", remote_side=[id], lazy="noload")
