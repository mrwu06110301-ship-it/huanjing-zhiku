"""评论路由"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.comment import Comment
from app.models.article import Article
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentOut
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/api/comments", tags=["评论"])


@router.get("/article/{article_id}", response_model=list[CommentOut])
async def get_comments(article_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Comment).where(Comment.article_id == article_id).order_by(Comment.created_at)
    )
    comments = result.scalars().all()

    # 批量获取作者名
    author_ids = list(set(c.author_id for c in comments))
    author_map = {}
    if author_ids:
        ar = await db.execute(select(User.id, User.nickname).where(User.id.in_(author_ids)))
        for row in ar:
            author_map[row[0]] = row[1]

    return [
        CommentOut(
            id=c.id, content=c.content, article_id=c.article_id,
            author_id=c.author_id, author_name=author_map.get(c.author_id, ""),
            parent_id=c.parent_id, created_at=c.created_at,
        )
        for c in comments
    ]


@router.post("/article/{article_id}", response_model=CommentOut, status_code=201)
async def add_comment(
    article_id: int,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 检查文章是否存在
    ar = await db.execute(select(Article).where(Article.id == article_id))
    if not ar.scalars().first():
        raise HTTPException(status_code=404, detail="文章不存在")

    comment = Comment(
        content=data.content,
        article_id=article_id,
        author_id=current_user.id,
    )
    db.add(comment)
    await db.flush()

    return CommentOut(
        id=comment.id, content=comment.content, article_id=comment.article_id,
        author_id=comment.author_id, author_name=current_user.nickname or current_user.username,
        parent_id=comment.parent_id, created_at=comment.created_at,
    )


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalars().first()
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在")
    if comment.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限删除此评论")
    await db.delete(comment)
    return {"detail": "删除成功"}
