"""方法标准路由"""

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.database import get_db
from app.models.standard import Standard
from app.models.user import User
from app.models.category import Category
from app.schemas.standard import StandardCreate, StandardOut
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/standards", tags=["方法标准"])

# 上传目录：backend/uploads/（与 Nginx 静态服务一致，同 upload.py）
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

DOC_TYPES = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"}
DOC_MAX_SIZE = 200 * 1024 * 1024  # 200MB，与 /api/upload/file 一致


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
    keyword: str | None = Query(None, max_length=100),
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
    if keyword:
        kw = f"%{keyword.strip()}%"
        cond = or_(Standard.title.like(kw), Standard.description.like(kw))
        query = query.where(cond)
        count_query = count_query.where(cond)

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


@router.post("/upload-batch", status_code=201)
async def upload_standards_batch(
    category_id: int = Form(...),
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量上传标准文件（PDF/Word 等）——管理员或已授权用户。

    与视频/论坛/FAQ 共用同一上传权限（can_upload_video）。
    文件名（去扩展名）作为标准标题；逐文件独立处理，单个失败不影响其余。
    """
    if current_user.role != "admin" and not current_user.can_upload_video:
        raise HTTPException(status_code=403, detail="您没有上传标准的权限，请联系管理员开通")

    if not files:
        raise HTTPException(status_code=400, detail="未选择文件")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="单次最多上传 50 个文件")

    cat = (await db.execute(select(Category).where(Category.id == category_id))).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=400, detail="分类不存在")

    created: list[StandardOut] = []
    failed: list[dict] = []
    for f in files:
        orig_name = os.path.basename(f.filename or "").strip()
        ext = os.path.splitext(orig_name)[1].lower()
        if ext not in DOC_TYPES:
            failed.append({"file": orig_name, "reason": f"不支持的文件类型 {ext or '(无扩展名)'}"})
            continue
        try:
            unique_name = f"{uuid.uuid4().hex}{ext}"
            file_path = os.path.join(UPLOAD_DIR, unique_name)
            size = 0
            with open(file_path, "wb") as out:
                while True:
                    chunk = await f.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > DOC_MAX_SIZE:
                        out.close()
                        os.remove(file_path)
                        raise ValueError("文件超过 200MB 限制")
                    out.write(chunk)
            title = os.path.splitext(orig_name)[0][:200]
            std = Standard(
                title=title, description="", std_type="document",
                category_id=category_id, file_url=f"/uploads/{unique_name}",
                is_public=True, author_id=current_user.id,
            )
            db.add(std)
            await db.flush()
            await db.refresh(std)
            created.append(_make_out(std, cat.name, current_user.nickname or current_user.username))
        except ValueError as e:
            failed.append({"file": orig_name, "reason": str(e)})
        except Exception as e:  # 单文件异常不阻断批量
            failed.append({"file": orig_name, "reason": f"保存失败: {e}"})
        finally:
            await f.close()

    if not created and failed:
        raise HTTPException(status_code=400, detail=f"全部文件上传失败: {failed[0]['reason']}")
    return {"created": created, "failed": failed, "success_count": len(created), "fail_count": len(failed)}


def _safe_remove(file_url: str) -> None:
    """删除 /uploads/ 物理文件（basename 白名单目录，防路径穿越）"""
    if not file_url or not file_url.startswith("/uploads/"):
        return
    name = os.path.basename(file_url)
    path = os.path.join(UPLOAD_DIR, name)
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass  # 物理文件删除失败不阻断记录删除


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
    _safe_remove(std.file_url)
    await db.delete(std)
    return {"detail": "删除成功"}
