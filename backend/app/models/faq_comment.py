"""常见问题评论模型"""

from datetime import datetime
from sqlalchemy import Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FAQComment(Base):
    __tablename__ = "faq_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    faq_id: Mapped[int] = mapped_column(Integer, ForeignKey("faqs.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    parent_id: Mapped[int] = mapped_column(Integer, ForeignKey("faq_comments.id"), nullable=True)
    created_at = mapped_column(DateTime, default=datetime.now)

    author = relationship("User", lazy="noload")
    faq = relationship("FAQ", lazy="noload")
