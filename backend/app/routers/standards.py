"""方法标准路由"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.standard import Standard
from app.models.user import User
from app.models.category import Category
from app.schemas.standard import StandardCreate, StandardOut
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/standards", tags=["方法标准"])


async def _get_cat_author(s: Standard, db: AsyncSession) -> tuple[str | None, str]:
    cat_name = None
    if s.category_id:
        cr = await db.execute(select(Category.name).where(Category.id == s.category_id))
        cat_name = cr.scalar()
    author_name = ""
    if s.author_id:
        ar = await db.execute(select(User.nickname).where(User.id == s.author_id))
        author_name = ar.scalar() or ""
    return cat_name, author_name


def _make_out(s: Standard, cat_name: str | None, author_name: str) -> StandardOut:
    return StandardOut(
        id=s.id, title=s.title, description=s.description,
        cover_image=s.cover_image, std_type=s.std_type,
        category_id=s.category_id, category_name=cat_name,
        tags=s.tags or [], file_url=s.file_url,
        is_public=s.is_public, view_count=s.view_count,
        download_count=s.download_count, author_name=author_name,
        created_at=s.created_at,
    )


@router.get("")
async def list_standards(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    std_type: str | None = None,
    category_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Standard).where(Standard.is_public == True)
    count_query = select(func.count(Standard.id)).where(Standard.is_public == True)

    if std_type:
        query = query.where(Standard.std_type == std_type)
        count_query = count_query.where(Standard.std_type == std_type)
    if category_id:
        query = query.where(Standard.category_id == category_id)
        count_query = count_query.where(Standard.category_id == category_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Standard.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    standards = result.scalars().all()

    items = []
    for s in standards:
        cat_name, author_name = await _get_cat_author(s, db)
        items.append(_make_out(s, cat_name, author_name))

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{standard_id}", response_model=StandardOut)
async def get_standard(standard_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Standard).where(Standard.id == standard_id))
    std = result.scalars().first()
    if not std:
        raise HTTPException(status_code=404, detail="标准不存在")
    std.view_count = (std.view_count or 0) + 1
    await db.flush()

    cat_name, author_name = await _get_cat_author(std, db)
    return _make_out(std, cat_name, author_name)


@router.post("", response_model=StandardOut, status_code=201)
async def create_standard(
    data: StandardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    std = Standard(**data.model_dump(), author_id=current_user.id)
    db.add(std)
    await db.flush()
    await db.refresh(std)
    return _make_out(std, None, current_user.nickname or current_user.username)


@router.delete("/{standard_id}")
async def delete_standard(
    standard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Standard).where(Standard.id == standard_id))
    std = result.scalars().first()
    if not std:
        raise HTTPException(status_code=404, detail="标准不存在")
    await db.delete(std)
    return {"detail": "删除成功"}
