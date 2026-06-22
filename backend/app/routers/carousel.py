"""轮播图路由"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from pydantic import BaseModel

from app.database import get_db
from app.models.carousel import CarouselSlide
from app.models.user import User
from app.dependencies.auth import require_admin

router = APIRouter(prefix="/api/carousel", tags=["轮播图"])


class CarouselCreate(BaseModel):
    image_url: str
    title: str = ""
    link_video_id: int | None = None
    sort_order: int = 0


class CarouselUpdate(BaseModel):
    image_url: str | None = None
    title: str | None = None
    link_video_id: int | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class CarouselOut(BaseModel):
    id: int
    image_url: str
    title: str
    link_video_id: int | None = None
    sort_order: int
    is_active: bool
    created_at: datetime | None = None

    class Config:
        from_attributes = True


@router.get("", response_model=list[CarouselOut])
async def list_carousel(db: AsyncSession = Depends(get_db)):
    """获取所有轮播图（公开）"""
    result = await db.execute(
        select(CarouselSlide).where(CarouselSlide.is_active == True)
        .order_by(CarouselSlide.sort_order.asc(), CarouselSlide.created_at.desc())
    )
    return result.scalars().all()


@router.get("/admin", response_model=list[CarouselOut])
async def admin_list_carousel(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """管理员获取所有轮播图（含隐藏）"""
    result = await db.execute(
        select(CarouselSlide).order_by(CarouselSlide.sort_order.asc(), CarouselSlide.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=CarouselOut, status_code=201)
async def create_carousel(
    data: CarouselCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    slide = CarouselSlide(**data.model_dump())
    db.add(slide)
    await db.flush()
    await db.refresh(slide)
    return CarouselOut(
        id=slide.id, image_url=slide.image_url, title=slide.title,
        link_video_id=slide.link_video_id, sort_order=slide.sort_order,
        is_active=slide.is_active,
        created_at=str(slide.created_at) if slide.created_at else None,
    )


@router.put("/{slide_id}", response_model=CarouselOut)
async def update_carousel(
    slide_id: int,
    data: CarouselUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(CarouselSlide).where(CarouselSlide.id == slide_id))
    slide = result.scalars().first()
    if not slide:
        raise HTTPException(status_code=404, detail="轮播图不存在")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(slide, key, val)
    await db.flush()
    return CarouselOut(
        id=slide.id, image_url=slide.image_url, title=slide.title,
        link_video_id=slide.link_video_id, sort_order=slide.sort_order,
        is_active=slide.is_active,
        created_at=str(slide.created_at) if slide.created_at else None,
    )


@router.delete("/{slide_id}")
async def delete_carousel(
    slide_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(CarouselSlide).where(CarouselSlide.id == slide_id))
    slide = result.scalars().first()
    if not slide:
        raise HTTPException(status_code=404, detail="轮播图不存在")
    await db.delete(slide)
    return {"detail": "已删除"}
