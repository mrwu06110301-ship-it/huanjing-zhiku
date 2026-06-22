"""视频评论路由"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.video_comment import VideoComment
from app.models.user import User
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/api/videos", tags=["视频评论"])


class CommentCreate(BaseModel):
    content: str
    parent_id: int | None = None


class CommentOut(BaseModel):
    id: int
    content: str
    video_id: int
    author_id: int
    author_name: str
    parent_id: int | None = None
    created_at: str | None = None

    class Config:
        from_attributes = True


@router.get("/{video_id}/comments", response_model=list[CommentOut])
async def list_comments(video_id: int, db: AsyncSession = Depends(get_db)):
    """获取视频评论"""
    result = await db.execute(
        select(VideoComment).where(VideoComment.video_id == video_id)
        .order_by(VideoComment.created_at.asc())
    )
    comments = result.scalars().all()

    author_ids = list(set(c.author_id for c in comments))
    author_map: dict[int, str] = {}
    if author_ids:
        ar = await db.execute(select(User.id, User.nickname, User.username).where(User.id.in_(author_ids)))
        for row in ar:
            author_map[row[0]] = row[1] or row[2]

    return [
        CommentOut(
            id=c.id, content=c.content, video_id=c.video_id,
            author_id=c.author_id, author_name=author_map.get(c.author_id, "未知"),
            parent_id=c.parent_id, created_at=str(c.created_at) if c.created_at else None,
        )
        for c in comments
    ]


@router.post("/{video_id}/comments", response_model=CommentOut, status_code=201)
async def create_comment(
    video_id: int,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """发表评论"""
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="评论不能为空")
    comment = VideoComment(
        content=data.content.strip(),
        video_id=video_id,
        author_id=current_user.id,
        parent_id=data.parent_id,
    )
    db.add(comment)
    await db.flush()

    return CommentOut(
        id=comment.id, content=comment.content, video_id=comment.video_id,
        author_id=comment.author_id,
        author_name=current_user.nickname or current_user.username,
        parent_id=comment.parent_id,
        created_at=str(comment.created_at) if comment.created_at else None,
    )


@router.delete("/{video_id}/comments/{comment_id}")
async def delete_comment(
    video_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除评论（作者或管理员）"""
    result = await db.execute(select(VideoComment).where(VideoComment.id == comment_id, VideoComment.video_id == video_id))
    comment = result.scalars().first()
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在")
    if comment.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权删除")
    await db.delete(comment)
    return {"detail": "已删除"}
