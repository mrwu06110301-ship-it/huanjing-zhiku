"""游戏接口 — 环监奇兵计分与排行榜（登录墙）"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.game_score import GameScore

router = APIRouter(prefix="/api/game", tags=["game"])

# 允许的场景（防脏数据）
ALLOWED_SCENES = {"flue-gas"}


class ScoreSubmit(BaseModel):
    scene: str = Field(default="flue-gas")
    score: int = Field(ge=0, le=1000)


class BoardRow(BaseModel):
    id: int
    username: str
    nickname: str
    score: int
    stars: int

    class Config:
        from_attributes = True


def _stars(score: int) -> int:
    if score >= 900: return 3
    if score >= 750: return 2
    if score >= 600: return 1
    return 0


@router.post("/{scene}/score")
async def submit_score(
    scene: str,
    body: ScoreSubmit,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """提交成绩（登录）：同一场景只保留最优，plays 累计"""
    if scene not in ALLOWED_SCENES:
        return {"ok": False, "msg": "场景不存在"}

    result = await db.execute(
        select(GameScore).where(GameScore.scene_id == scene, GameScore.user_id == user.id)
    )
    row = result.scalar_one_or_none()

    if row is None:
        row = GameScore(scene_id=scene, user_id=user.id, score=body.score, stars=_stars(body.score), plays=1)
        db.add(row)
    else:
        row.plays += 1
        if body.score > row.score:
            row.score = body.score
            row.stars = _stars(body.score)

    await db.commit()
    return {"ok": True, "best": row.score, "stars": row.stars, "plays": row.plays}


@router.get("/{scene}/board")
async def get_board(scene: str, db: AsyncSession = Depends(get_db)):
    """排行榜（公开）：Top 20"""
    if scene not in ALLOWED_SCENES:
        return []

    result = await db.execute(
        select(GameScore, User.username, User.nickname)
        .join(User, GameScore.user_id == User.id)
        .where(GameScore.scene_id == scene)
        .order_by(GameScore.score.desc())
        .limit(20)
    )
    rows = result.all()
    return [
        BoardRow(id=gs.id, username=u or "", nickname=nick or "", score=gs.score, stars=gs.stars)
        for gs, u, nick in rows
    ]
