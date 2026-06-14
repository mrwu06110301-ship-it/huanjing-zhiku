"""关于作者页面内容模型 — 单行存储，管理员可编辑"""

from datetime import datetime
from sqlalchemy import Integer, Text, String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AboutContent(Base):
    __tablename__ = "about_content"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text, default="")
    images: Mapped[str] = mapped_column(Text, default="[]")  # JSON 字符串，存储图片 URL 列表
    auto_reply_text: Mapped[str] = mapped_column(Text, default="您的留言已收到，感谢您的支持与反馈！管理员将尽快回复您。")
    updated_at = mapped_column(DateTime, default=datetime.utcnow)
