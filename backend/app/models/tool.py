"""常用工具模型"""

from sqlalchemy import String, Integer, Text, Boolean, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Tool(Base):
    __tablename__ = "tools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(100), default="")
    # 类型: calculator / converter / model
    tool_type: Mapped[str] = mapped_column(String(30), default="model", index=True)
    category: Mapped[str] = mapped_column(String(50), default="")
    config: Mapped[str] = mapped_column(JSON, default=dict)  # 工具配置参数（预留）
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at = mapped_column(DateTime, server_default=func.now())
    updated_at = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
