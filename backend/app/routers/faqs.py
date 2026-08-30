"""常见问题路由"""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

from app.database import get_db
from app.models.faq import FAQ
from app.models.faq_comment import FAQComment
from app.models.user import User
from app.models.category import Category
from app.schemas.faq import FAQCreate, FAQUpdate, FAQOut
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/faqs", tags=["常见问题"])


async def get_optional_user(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    """可选的用户认证（未登录返回 None，与留言模块一致）"""
    from app.services.auth import decode_access_token
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    payload = decode_access_token(auth_header[7:])
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == int(user_id)))
    return result.scalar_one_or_none()


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


async def _get_comment_counts(db: AsyncSession, faq_ids: list[int]) -> dict[int, int]:
    """批量取 FAQ 评论数"""
    if not faq_ids:
        return {}
    rows = await db.execute(
        select(FAQComment.faq_id, func.count(FAQComment.id))
        .where(FAQComment.faq_id.in_(faq_ids))
        .group_by(FAQComment.faq_id)
    )
    return {fid: cnt for fid, cnt in rows.all()}


def _make_out(
    f: FAQ, cat_name: str | None, author_name: str,
    comment_count: int = 0, liked: bool = False,
) -> FAQOut:
    return FAQOut(
        id=f.id, question=f.question, answer=f.answer,
        faq_type=f.faq_type, category_id=f.category_id,
        category_name=cat_name, tags=f.tags or [],
        is_pinned=f.is_pinned, is_public=f.is_public,
        view_count=f.view_count, like_count=f.like_count or 0,
        liked=liked, comment_count=comment_count,
        author_id=f.author_id, author_name=author_name,
        created_at=f.created_at,
    )


def _faq_search_cond(keyword: str):
    """FAQ 全量搜索条件：空格拆词 AND 组合 + 空白压缩兜底

    - 覆盖 question 与 answer（全量搜索）
    - 多词：\"采样 人员\" → 每词分别 LIKE（question/answer 任一命中）后 AND
    - 空白压缩兜底：\"HJ630\" 命中原文 \"HJ 630\"、\"HJ  630\"（把两边空白压掉再比对）
    """
    conds = []
    for term in keyword.split():
        like = f"%{term}%"
        conds.append(or_(FAQ.question.like(like), FAQ.answer.like(like)))
    # 空白压缩后的整串匹配（处理关键词内空格与原文不一致的情况）
    norm_kw = "".join(keyword.split())
    if norm_kw and len(norm_kw) != len(keyword):
        compact = or_(FAQ.question.like(f"%{norm_kw}%"), FAQ.answer.like(f"%{norm_kw}%"))
        conds.append(compact)
    return and_(*conds) if conds else None


def _split_search_terms(keyword: str) -> list[str]:
    """把无空格的连续中文串按 2-gram 公共前缀切成单字/词元，辅助召回

    纯兜底：整串/空格拆词都搜不到时，用单字 AND 保证"人员独立监测"这类
    连续输入也能召回（AND 语义保证相关性不劣化）。
    """
    norm = "".join(keyword.split())
    # 已有空格分词或长度 <=2 无需切分
    if len(keyword.split()) > 1 or len(norm) <= 2:
        return keyword.split()
    return list(norm)


@router.get("")
async def list_faqs(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    faq_type: str | None = None,
    category_id: int | None = None,
    keyword: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    query = select(FAQ).where(FAQ.is_public == True)
    count_query = select(func.count(FAQ.id)).where(FAQ.is_public == True)

    if faq_type:
        query = query.where(FAQ.faq_type == faq_type)
        count_query = count_query.where(FAQ.faq_type == faq_type)
    if category_id:
        query = query.where(FAQ.category_id == category_id)
        count_query = count_query.where(FAQ.category_id == category_id)
    if keyword and keyword.strip():
        kw = keyword.strip()
        # 先按常规语义搜索（空格拆词 AND + 压缩空白兜底）；零命中时降级为单字 AND 召回
        primary = await db.execute(count_query.where(_faq_search_cond(kw)))
        if (primary.scalar() or 0) > 0 or not _split_search_terms(kw):
            cond = _faq_search_cond(kw)
        else:
            terms = _split_search_terms(kw)
            conds = [or_(FAQ.question.like(f"%{t}%"), FAQ.answer.like(f"%{t}%")) for t in terms]
            cond = and_(*conds)
        query = query.where(cond)
        count_query = count_query.where(cond)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(FAQ.is_pinned.desc(), FAQ.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    faqs = result.scalars().all()

    comment_counts = await _get_comment_counts(db, [f.id for f in faqs])
    uid = str(current_user.id) if current_user else None

    items = []
    for f in faqs:
        cat_name, author_name = await _get_cat_author(f, db)
        try:
            liked = uid in [str(u) for u in json.loads(f.like_users)] if f.like_users else False
        except (ValueError, TypeError):
            liked = False
        items.append(_make_out(f, cat_name, author_name, comment_counts.get(f.id, 0), liked))

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
    cr = await db.execute(select(func.count(FAQComment.id)).where(FAQComment.faq_id == faq_id))
    comment_count = cr.scalar() or 0
    return _make_out(faq, cat_name, author_name, comment_count)


@router.post("/{faq_id}/view")
async def report_view(
    faq_id: int,
    db: AsyncSession = Depends(get_db),
):
    """展开 FAQ 条目时上报一次预览计数"""
    result = await db.execute(select(FAQ).where(FAQ.id == faq_id))
    faq = result.scalars().first()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ不存在")
    faq.view_count = (faq.view_count or 0) + 1
    await db.flush()
    return {"view_count": faq.view_count}


@router.post("/{faq_id}/like")
async def toggle_like(
    faq_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """点赞/取消点赞 FAQ"""
    result = await db.execute(select(FAQ).where(FAQ.id == faq_id))
    faq = result.scalars().first()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ不存在")

    like_users = json.loads(faq.like_users) if faq.like_users else []
    uid = str(current_user.id)
    if uid in [str(u) for u in like_users]:
        like_users = [u for u in like_users if str(u) != uid]
        faq.like_count = max(0, (faq.like_count or 0) - 1)
        action = "unliked"
    else:
        like_users.append(current_user.id)
        faq.like_count = (faq.like_count or 0) + 1
        action = "liked"
    faq.like_users = json.dumps(like_users, ensure_ascii=False)
    await db.flush()
    return {"like_count": faq.like_count, "liked": action == "liked"}


@router.get("/{faq_id}/comments")
async def list_comments(
    faq_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取 FAQ 评论列表"""
    rows = await db.execute(
        select(FAQComment, User.nickname, User.username, User.avatar)
        .outerjoin(User, FAQComment.author_id == User.id)
        .where(FAQComment.faq_id == faq_id)
        .order_by(FAQComment.created_at.asc())
    )
    items = []
    for c, nickname, username, avatar in rows.all():
        items.append({
            "id": c.id, "content": c.content, "faq_id": c.faq_id,
            "author_id": c.author_id, "author_name": nickname or username or "用户",
            "author_avatar": avatar or "", "created_at": c.created_at,
        })
    return {"items": items, "total": len(items)}


@router.post("/{faq_id}/comments", status_code=201)
async def create_comment(
    faq_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """发表 FAQ 评论"""
    content = (data.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="评论内容不能为空")
    result = await db.execute(select(FAQ).where(FAQ.id == faq_id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="FAQ不存在")
    comment = FAQComment(content=content, faq_id=faq_id, author_id=current_user.id)
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return {
        "id": comment.id, "content": comment.content, "faq_id": comment.faq_id,
        "author_id": comment.author_id,
        "author_name": current_user.nickname or current_user.username or "用户",
        "author_avatar": current_user.avatar or "", "created_at": comment.created_at,
    }


@router.delete("/{faq_id}/comments/{comment_id}")
async def delete_comment(
    faq_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除评论 — 作者本人或管理员"""
    result = await db.execute(
        select(FAQComment).where(FAQComment.id == comment_id, FAQComment.faq_id == faq_id)
    )
    comment = result.scalars().first()
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在")
    if comment.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限删除")
    await db.delete(comment)
    return {"detail": "删除成功"}


@router.post("", response_model=FAQOut, status_code=201)
async def create_faq(
    data: FAQCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建 FAQ — 管理员或具备上传权限的授权用户（与论坛/视频发布一致）"""
    if current_user.role != "admin" and not current_user.can_upload_video:
        raise HTTPException(status_code=403, detail="您没有新增问题的权限，请联系管理员授权")
    faq = FAQ(**data.model_dump(), author_id=current_user.id)
    db.add(faq)
    await db.flush()
    await db.refresh(faq)

    cat_name, author_name = await _get_cat_author(faq, db)
    return _make_out(faq, cat_name, author_name, 0)


@router.put("/{faq_id}", response_model=FAQOut)
async def update_faq(
    faq_id: int,
    data: FAQUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """编辑 FAQ — 仅管理员"""
    result = await db.execute(select(FAQ).where(FAQ.id == faq_id))
    faq = result.scalars().first()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ不存在")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(faq, field, value)
    await db.flush()
    await db.refresh(faq)

    cat_name, author_name = await _get_cat_author(faq, db)
    cr = await db.execute(select(func.count(FAQComment.id)).where(FAQComment.faq_id == faq_id))
    comment_count = cr.scalar() or 0
    return _make_out(faq, cat_name, author_name, comment_count)


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
