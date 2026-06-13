"""常见问题路由"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.faq import FAQ
from app.models.user import User
from app.models.category import Category
from app.schemas.faq import FAQCreate, FAQOut
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/faqs", tags=["常见问题"])


async def _get_cat_author(f: FAQ, db: AsyncSession) -> tuple[str | None, str]:
    cat_name = None
    if f.category_id:
        cr = await db.execute(select(Category.name).where(Category.id == f.category_id))
        cat_name = cr.scalar()
    author_name = ""
    if f.author_id:
        ar = await db.execute(select(User.nickname).where(User.id == f.author_id))
        author_name = ar.scalar() or ""
    return cat_name, author_name


def _make_out(f: FAQ, cat_name: str | None, author_name: str) -> FAQOut:
    return FAQOut(
        id=f.id, question=f.question, answer=f.answer,
        faq_type=f.faq_type, category_id=f.category_id,
        category_name=cat_name, tags=f.tags or [],
        is_pinned=f.is_pinned, is_public=f.is_public,
        view_count=f.view_count, author_name=author_name,
        created_at=f.created_at,
    )


@router.get("")
async def list_faqs(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    faq_type: str | None = None,
    category_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(FAQ).where(FAQ.is_public == True)
    count_query = select(func.count(FAQ.id)).where(FAQ.is_public == True)

    if faq_type:
        query = query.where(FAQ.faq_type == faq_type)
        count_query = count_query.where(FAQ.faq_type == faq_type)
    if category_id:
        query = query.where(FAQ.category_id == category_id)
        count_query = count_query.where(FAQ.category_id == category_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(FAQ.is_pinned.desc(), FAQ.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    faqs = result.scalars().all()

    items = []
    for f in faqs:
        cat_name, author_name = await _get_cat_author(f, db)
        items.append(_make_out(f, cat_name, author_name))

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{faq_id}", response_model=FAQOut)
async def get_faq(faq_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FAQ).where(FAQ.id == faq_id))
    faq = result.scalars().first()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ不存在")
    faq.view_count = (faq.view_count or 0) + 1
    await db.flush()

    cat_name, author_name = await _get_cat_author(faq, db)
    return _make_out(faq, cat_name, author_name)


@router.post("", response_model=FAQOut, status_code=201)
async def create_faq(
    data: FAQCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    faq = FAQ(**data.model_dump(), author_id=current_user.id)
    db.add(faq)
    await db.flush()
    await db.refresh(faq)

    cat_name, author_name = await _get_cat_author(faq, db)
    return _make_out(faq, cat_name, author_name)


@router.delete("/{faq_id}")
async def delete_faq(
    faq_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(FAQ).where(FAQ.id == faq_id))
    faq = result.scalars().first()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ不存在")
    if faq.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限删除")
    await db.delete(faq)
    return {"detail": "删除成功"}
