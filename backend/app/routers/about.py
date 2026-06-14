"""关于作者路由"""

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.about import AboutContent
from app.dependencies.auth import require_admin
from app.models.user import User

router = APIRouter(prefix="/api/about", tags=["关于作者"])


class AboutOut(BaseModel):
    id: int
    content: str
    images: str  # JSON 字符串
    auto_reply_text: str = "您的留言已收到，感谢您的支持与反馈！管理员将尽快回复您。"
    updated_at: str | None = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_format(cls, obj):
        return cls(
            id=obj.id,
            content=obj.content,
            images=obj.images,
            auto_reply_text=obj.auto_reply_text or "您的留言已收到，感谢您的支持与反馈！管理员将尽快回复您。",
            updated_at=str(obj.updated_at) if obj.updated_at else None,
        )


class AboutUpdate(BaseModel):
    content: str
    images: str  # JSON 字符串，如 '["url1","url2"]'
    auto_reply_text: str = "您的留言已收到，感谢您的支持与反馈！管理员将尽快回复您。"


@router.get("", response_model=AboutOut)
async def get_about(db: AsyncSession = Depends(get_db)):
    """获取关于作者内容"""
    result = await db.execute(select(AboutContent))
    about = result.scalars().first()
    if not about:
        about = AboutContent(content="", images="[]")
        db.add(about)
        await db.flush()
    return AboutOut.from_orm_with_format(about)


@router.put("", response_model=AboutOut)
async def update_about(
    data: AboutUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """更新关于作者内容（仅管理员）"""
    result = await db.execute(select(AboutContent))
    about = result.scalars().first()
    if not about:
        about = AboutContent(content=data.content, images=data.images, auto_reply_text=data.auto_reply_text)
        db.add(about)
    else:
        about.content = data.content
        about.images = data.images
        about.auto_reply_text = data.auto_reply_text
        about.updated_at = datetime.utcnow()
    await db.flush()
    return AboutOut.from_orm_with_format(about)
