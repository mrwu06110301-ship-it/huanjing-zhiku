"""用户模型"""

from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    nickname: Mapped[str] = mapped_column(String(50), default="")
    avatar: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # 微信扫码登录（开放平台网站应用）——NOT NULL 默认空串，勿用可空列（NULL 会让 /me 序列化 500）
    wechat_openid: Mapped[str] = mapped_column(String(64), default="", server_default="", nullable=False)
    wechat_unionid: Mapped[str] = mapped_column(String(64), default="", server_default="", nullable=False)
    # 角色: admin / editor / user
    role: Mapped[str] = mapped_column(String(20), default="user")
    can_upload_video: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 短信登录自动建号的账号为随机密码，登录后需引导补设账号密码
    need_password_setup: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at = mapped_column(DateTime, default=datetime.now)
    updated_at = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    # 关联
    articles = relationship("Article", back_populates="author", lazy="noload")
    comments = relationship("Comment", back_populates="author", lazy="noload")
