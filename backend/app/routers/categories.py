"""分类路由 — 管理员可自定义增删改查"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.category import Category
from app.schemas.category import CategoryOut, CategoryCreate, CategoryUpdate
from app.dependencies.auth import require_admin

router = APIRouter(prefix="/api/categories", tags=["分类"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    module: str | None = None,
    all: bool = False,  # 管理员查看全部（含非活跃）
    db: AsyncSession = Depends(get_db),
):
    query = select(Category)
    if not all:
        query = query.where(Category.is_active == True)
    if module:
        query = query.where(Category.module == module)
    query = query.order_by(Category.module, Category.sort_order, Category.id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """管理员创建分类"""
    # 检查 slug 是否已存在
    existing = await db.execute(select(Category).where(Category.slug == data.slug))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail=f"标识符 '{data.slug}' 已存在")

    cat = Category(**data.model_dump())
    db.add(cat)
    await db.flush()
    return cat


@router.put("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """管理员更新分类"""
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")

    update_data = data.model_dump(exclude_unset=True)
    # 若修改 slug，检查唯一性
    if "slug" in update_data and update_data["slug"] != cat.slug:
        existing = await db.execute(select(Category).where(Category.slug == update_data["slug"]))
        if existing.scalars().first():
            raise HTTPException(status_code=409, detail=f"标识符 '{update_data['slug']}' 已存在")

    for key, value in update_data.items():
        setattr(cat, key, value)
    await db.flush()
    return cat


@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """管理员删除分类（软删除：标记为 inactive）"""
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    cat.is_active = False
    await db.flush()
    return {"detail": "分类已停用"}
