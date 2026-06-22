"""学习视频路由 — 上传/管理/轮播/播放"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.video import Video
from app.models.user import User
from app.models.category import Category
from app.schemas.video import VideoCreate, VideoUpdate, VideoOut
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/videos", tags=["学习视频"])


def _make_video_out(v: Video, cat_name: str | None, author_name: str, cat_color: str = "") -> VideoOut:
    return VideoOut(
        id=v.id, title=v.title, description=v.description,
        cover_image=v.cover_image, video_url=v.video_url,
        embed_url=v.embed_url or "",
        video_type=v.video_type, category_id=v.category_id,
        category_name=cat_name, category_color=cat_color,
        tags=v.tags or [], duration=v.duration,
        is_public=v.is_public, is_featured=v.is_featured or False,
        view_count=v.view_count,
        author_name=author_name, created_at=v.created_at,
    )


async def _get_cat_author(v: Video, db: AsyncSession) -> tuple[str | None, str, str]:
    cat_name = None
    cat_color = ""
    if v.category_id:
        cr = await db.execute(select(Category.name, Category.color).where(Category.id == v.category_id))
        row = cr.first()
        if row:
            cat_name = row[0]
            cat_color = row[1] or ""
    author_name = ""
    if v.author_id:
        ar = await db.execute(select(User.nickname, User.username).where(User.id == v.author_id))
        row = ar.first()
        if row:
            author_name = row[0] or row[1]
    return cat_name, author_name, cat_color


@router.get("")
async def list_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    video_type: str | None = None,
    category_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """获取视频列表"""
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
        cat_name, author_name, cat_color = await _get_cat_author(v, db)
        items.append(_make_video_out(v, cat_name, author_name, cat_color))

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/featured", response_model=list[VideoOut])
async def get_featured_videos(db: AsyncSession = Depends(get_db)):
    """获取轮播推荐视频（最多5个）"""
    result = await db.execute(
        select(Video).where(Video.is_featured == True, Video.is_public == True)
        .order_by(Video.view_count.desc()).limit(5)
    )
    videos = result.scalars().all()
    items = []
    for v in videos:
        cat_name, author_name, cat_color = await _get_cat_author(v, db)
        items.append(_make_video_out(v, cat_name, author_name, cat_color))
    return items


@router.get("/recommended", response_model=list[VideoOut])
async def get_recommended_videos(db: AsyncSession = Depends(get_db)):
    """获取推荐视频（按播放量排序，排除轮播视频）"""
    result = await db.execute(
        select(Video).where(Video.is_public == True)
        .order_by(Video.view_count.desc()).limit(8)
    )
    videos = result.scalars().all()
    items = []
    for v in videos:
        cat_name, author_name, cat_color = await _get_cat_author(v, db)
        items.append(_make_video_out(v, cat_name, author_name, cat_color))
    return items


@router.get("/{video_id}", response_model=VideoOut)
async def get_video(video_id: int, db: AsyncSession = Depends(get_db)):
    """获取视频详情"""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalars().first()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    video.view_count = (video.view_count or 0) + 1
    await db.flush()

    cat_name, author_name, cat_color = await _get_cat_author(video, db)
    return _make_video_out(video, cat_name, author_name, cat_color)


@router.post("", response_model=VideoOut, status_code=201)
async def create_video(
    data: VideoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建视频 — 管理员或已授权用户"""
    if current_user.role != "admin" and not current_user.can_upload_video:
        raise HTTPException(status_code=403, detail="您没有上传视频的权限")
    video = Video(**data.model_dump(), author_id=current_user.id)
    db.add(video)
    await db.flush()
    await db.refresh(video)
    return _make_video_out(video, None, current_user.nickname or current_user.username)


@router.put("/{video_id}", response_model=VideoOut)
async def update_video(
    video_id: int,
    data: VideoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """更新视频信息（仅管理员）"""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalars().first()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(video, key, val)
    await db.flush()
    cat_name, author_name, cat_color = await _get_cat_author(video, db)
    return _make_video_out(video, cat_name, author_name, cat_color)


@router.delete("/{video_id}")
async def delete_video(
    video_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """删除视频（仅管理员）"""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalars().first()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    await db.delete(video)
    return {"detail": "已删除"}


@router.post("/{video_id}/toggle-featured", response_model=VideoOut)
async def toggle_featured(
    video_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """切换视频轮播推荐状态（仅管理员）"""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalars().first()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    video.is_featured = not video.is_featured
    await db.flush()
    cat_name, author_name, cat_color = await _get_cat_author(video, db)
    return _make_video_out(video, cat_name, author_name, cat_color)


# ========== 上传权限管理 ==========

@router.get("/upload-permission/check")
async def check_upload_permission(
    current_user: User = Depends(get_current_user),
):
    """检查当前用户是否有上传权限"""
    return {"can_upload": current_user.role == "admin" or current_user.can_upload_video}


@router.put("/upload-permission/{user_id}")
async def set_upload_permission(
    user_id: int,
    can_upload: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """管理员设置用户上传权限"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="管理员默认拥有上传权限")
    user.can_upload_video = can_upload
    await db.flush()
    return {"detail": "已更新", "user_id": user_id, "can_upload": can_upload}
