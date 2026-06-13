"""学习视频路由"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.video import Video
from app.models.user import User
from app.models.category import Category
from app.schemas.video import VideoCreate, VideoOut
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/videos", tags=["学习视频"])


def _make_video_out(v: Video, cat_name: str | None, author_name: str) -> VideoOut:
    return VideoOut(
        id=v.id, title=v.title, description=v.description,
        cover_image=v.cover_image, video_url=v.video_url,
        video_type=v.video_type, category_id=v.category_id,
        category_name=cat_name, tags=v.tags or [], duration=v.duration,
        is_public=v.is_public, view_count=v.view_count,
        author_name=author_name, created_at=v.created_at,
    )


async def _get_cat_author(v: Video, db: AsyncSession) -> tuple[str | None, str]:
    cat_name = None
    if v.category_id:
        cr = await db.execute(select(Category.name).where(Category.id == v.category_id))
        cat_name = cr.scalar()
    author_name = ""
    if v.author_id:
        ar = await db.execute(select(User.nickname).where(User.id == v.author_id))
        author_name = ar.scalar() or ""
    return cat_name, author_name


@router.get("")
async def list_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    video_type: str | None = None,
    category_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Video).where(Video.is_public == True)
    count_query = select(func.count(Video.id)).where(Video.is_public == True)

    if video_type:
        query = query.where(Video.video_type == video_type)
        count_query = count_query.where(Video.video_type == video_type)
    if category_id:
        query = query.where(Video.category_id == category_id)
        count_query = count_query.where(Video.category_id == category_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Video.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    videos = result.scalars().all()

    items = []
    for v in videos:
        cat_name, author_name = await _get_cat_author(v, db)
        items.append(_make_video_out(v, cat_name, author_name))

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{video_id}", response_model=VideoOut)
async def get_video(video_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalars().first()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    video.view_count = (video.view_count or 0) + 1
    await db.flush()

    cat_name, author_name = await _get_cat_author(video, db)
    return _make_video_out(video, cat_name, author_name)


@router.post("", response_model=VideoOut, status_code=201)
async def create_video(
    data: VideoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    video = Video(**data.model_dump(), author_id=current_user.id)
    db.add(video)
    await db.flush()
    await db.refresh(video)

    return _make_video_out(
        video, None, current_user.nickname or current_user.username
    )
