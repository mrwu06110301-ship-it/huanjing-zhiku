"""游戏成绩模型 — 环监奇兵各场景计分与排行榜"""

from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GameScore(Base):
    __tablename__ = "game_scores"
    __table_args__ = (
        # 每人每场景只保留一条最优成绩（提交更优则覆盖）
        UniqueConstraint("scene_id", "user_id", name="uq_game_scene_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # flue-gas / dust / ...
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    plays: Mapped[int] = mapped_column(Integer, default=1)          # 累计游玩次数
    stars: Mapped[int] = mapped_column(Integer, default=0)          # 星级 0-3
    updated_at = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    user = relationship("User", lazy="noload")
