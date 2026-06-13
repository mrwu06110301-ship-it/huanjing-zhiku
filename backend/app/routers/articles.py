"""文章路由 — 论坛帖子、标准解读等"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.article import Article
from app.models.user import User
from app.models.category import Category
from app.schemas.article import ArticleCreate, ArticleUpdate, ArticleOut, ArticleListOut
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/articles", tags=["文章"])


@router.get("")
async def list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    module: str | None = None,
    category_id: int | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """文章列表（公开的已审核文章 + 管理员可看全部）"""
    query = select(Article)
    count_query = select(func.count(Article.id))

    # 公开接口默认只返回已审核文章；传 status 参数可筛选（如 pending）
    if status:
        query = query.where(Article.status == status)
    else:
        query = query.where(Article.status == "approved")

    if module:
        query = query.where(Article.module == module)
    if category_id:
        query = query.where(Article.category_id == category_id)

    query = query.where(Article.is_public == True)
    query = query.order_by(Article.is_pinned.desc(), Article.created_at.desc())

    # 总数
    total_result = await db.execute(count_query.where(Article.is_public == True))
    total = total_result.scalar() or 0

    # 分页
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    articles = result.scalars().all()

    # 手动组装 category_name 和 author_name
    items = []
    for a in articles:
        cat_name = None
        if a.category_id:
            cr = await db.execute(select(Category.name).where(Category.id == a.category_id))
            cat_name = cr.scalar()
        author_name = ""
        if a.author_id:
            ar = await db.execute(select(User.nickname).where(User.id == a.author_id))
            author_name = ar.scalar() or ""

        items.append(ArticleListOut(
            id=a.id, title=a.title, summary=a.summary, cover_image=a.cover_image,
            module=a.module, category_id=a.category_id, category_name=cat_name,
            tags=a.tags or [], status=a.status, is_pinned=a.is_pinned,
            view_count=a.view_count, like_count=a.like_count, author_name=author_name,
            created_at=a.created_at,
        ))

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{article_id}", response_model=ArticleOut)
async def get_article(article_id: int, db: AsyncSession = Depends(get_db)):
    # 用列式查询避免 ORM 对象的延迟加载问题
    result = await db.execute(
        select(
            Article.id, Article.title, Article.content, Article.summary,
            Article.cover_image, Article.module, Article.category_id,
            Article.tags, Article.status, Article.is_pinned, Article.is_public,
            Article.view_count, Article.like_count, Article.author_id,
            Article.created_at, Article.updated_at,
        ).where(Article.id == article_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="文章不存在")

    # 用独立 UPDATE 语句增加浏览量，避免 ORM flush/refresh 触发 MissingGreenlet
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(Article).where(Article.id == article_id).values(view_count=Article.view_count + 1)
    )

    # 组装额外字段
    cat_name = None
    if row.category_id:
        cr = await db.execute(select(Category.name).where(Category.id == row.category_id))
        cat_name = cr.scalar()
    author_name = ""
    if row.author_id:
        ar = await db.execute(select(User.nickname).where(User.id == row.author_id))
        author_name = ar.scalar() or ""

    return ArticleOut(
        id=row.id, title=row.title, content=row.content,
        summary=row.summary, cover_image=row.cover_image,
        module=row.module, category_id=row.category_id, category_name=cat_name,
        tags=row.tags or [], status=row.status, is_pinned=row.is_pinned,
        is_public=row.is_public, view_count=(row.view_count or 0) + 1,
        like_count=row.like_count, author_id=row.author_id, author_name=author_name,
        created_at=row.created_at, updated_at=row.updated_at,
    )


@router.post("", response_model=ArticleOut, status_code=201)
async def create_article(
    data: ArticleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    article = Article(
        title=data.title, content=data.content, summary=data.summary,
        cover_image=data.cover_image, module=data.module,
        category_id=data.category_id, tags=data.tags,
        is_public=data.is_public, author_id=current_user.id,
        # 管理员直接通过，普通用户需审核
        status="approved" if current_user.role == "admin" else "pending",
    )
    db.add(article)
    await db.flush()

    # flush 后用列式查询取回数据，避免 refresh 触发 MissingGreenlet
    row = (await db.execute(
        select(
            Article.id, Article.title, Article.content, Article.summary,
            Article.cover_image, Article.module, Article.category_id,
            Article.tags, Article.status, Article.is_pinned, Article.is_public,
            Article.view_count, Article.like_count, Article.author_id,
            Article.created_at, Article.updated_at,
        ).where(Article.id == article.id)
    )).first()

    cat_name = None
    if row.category_id:
        cr = await db.execute(select(Category.name).where(Category.id == row.category_id))
        cat_name = cr.scalar()

    return ArticleOut(
        id=row.id, title=row.title, content=row.content,
        summary=row.summary, cover_image=row.cover_image,
        module=row.module, category_id=row.category_id, category_name=cat_name,
        tags=row.tags or [], status=row.status, is_pinned=row.is_pinned,
        is_public=row.is_public, view_count=row.view_count or 0,
        like_count=row.like_count or 0, author_id=row.author_id,
        author_name=current_user.nickname or current_user.username,
        created_at=row.created_at, updated_at=row.updated_at,
    )


@router.put("/{article_id}", response_model=ArticleOut)
async def update_article(
    article_id: int,
    data: ArticleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Article).where(Article.id == article_id))
    article = result.scalars().first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")
    if article.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限修改此文章")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(article, key, value)
    await db.flush()

    # flush 后用列式查询取回数据，避免 refresh 触发 MissingGreenlet
    row = (await db.execute(
        select(
            Article.id, Article.title, Article.content, Article.summary,
            Article.cover_image, Article.module, Article.category_id,
            Article.tags, Article.status, Article.is_pinned, Article.is_public,
            Article.view_count, Article.like_count, Article.author_id,
            Article.created_at, Article.updated_at,
        ).where(Article.id == article_id)
    )).first()

    cat_name = None
    if row.category_id:
        cr = await db.execute(select(Category.name).where(Category.id == row.category_id))
        cat_name = cr.scalar()
    author_name = ""
    if row.author_id:
        ar = await db.execute(select(User.nickname).where(User.id == row.author_id))
        author_name = ar.scalar() or ""

    return ArticleOut(
        id=row.id, title=row.title, content=row.content,
        summary=row.summary, cover_image=row.cover_image,
        module=row.module, category_id=row.category_id, category_name=cat_name,
        tags=row.tags or [], status=row.status, is_pinned=row.is_pinned,
        is_public=row.is_public, view_count=row.view_count or 0,
        like_count=row.like_count or 0, author_id=row.author_id, author_name=author_name,
        created_at=row.created_at, updated_at=row.updated_at,
    )


@router.delete("/{article_id}")
async def delete_article(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Article).where(Article.id == article_id))
    article = result.scalars().first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")
    if article.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限删除此文章")
    await db.delete(article)
    return {"detail": "删除成功"}
