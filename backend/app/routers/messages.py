"""留言路由 — 即发即显，支持点赞和公开回复"""

import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.message import Message
from app.models.about import AboutContent
from app.models.user import User
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/messages", tags=["留言"])


async def get_optional_user(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    """可选的用户认证"""
    from app.services.auth import decode_access_token
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == int(user_id)))
    return result.scalar_one_or_none()


class MessageCreate(BaseModel):
    content: str
    contact: str = ""


class MessageOut(BaseModel):
    id: int
    content: str
    contact: str
    author_id: int | None = None
    author_name: str | None = None
    like_count: int = 0
    liked: bool = False
    reply: str = ""
    parent_id: int | None = None
    created_at: str | None = None

    class Config:
        from_attributes = True


async def _format_messages(messages: list[Message], db: AsyncSession, current_user_id: int | None = None) -> list[MessageOut]:
    """格式化留言列表"""
    author_ids = list(set(m.author_id for m in messages if m.author_id))
    author_map: dict[int, str] = {}
    if author_ids:
        ar = await db.execute(select(User.id, User.nickname, User.username).where(User.id.in_(author_ids)))
        for row in ar:
            author_map[row[0]] = row[1] or row[2]

    result = []
    for m in messages:
        like_users = []
        try:
            like_users = json.loads(m.like_users) if m.like_users else []
        except (json.JSONDecodeError, TypeError):
            pass

        liked = bool(current_user_id and str(current_user_id) in [str(uid) for uid in like_users])

        is_system = m.reply == "__SYSTEM__" or (m.reply or "").startswith("__SYSTEM__")

        result.append(MessageOut(
            id=m.id, content=m.content, contact=m.contact,
            author_id=m.author_id,
            author_name=author_map.get(m.author_id) if m.author_id else None,
            like_count=m.like_count, liked=liked,
            reply=m.reply.replace("__SYSTEM__", "") if is_system else (m.reply or ""),
            parent_id=m.parent_id,
            created_at=str(m.created_at) if m.created_at else None,
        ))
    return result


# ========== 公开 API ==========

@router.get("", response_model=list[MessageOut])
async def get_messages(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """获取所有顶级留言（即发即显）"""
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Message).where(Message.parent_id.is_(None))
        .order_by(Message.like_count.desc(), Message.created_at.desc())
        .offset(offset).limit(page_size)
    )
    messages = result.scalars().all()
    return await _format_messages(messages, db)


@router.post("", response_model=MessageOut, status_code=201)
async def create_message(
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """提交留言（即发即显，无需审核）"""
    message = Message(
        content=data.content,
        contact=data.contact,
        author_id=current_user.id if current_user else None,
    )
    db.add(message)
    await db.flush()

    # 首次留言自动回复（仅登录用户）
    if current_user:
        count_result = await db.execute(
            select(Message).where(Message.author_id == current_user.id)
        )
        user_messages = count_result.scalars().all()
        if len(user_messages) == 1:
            about_result = await db.execute(select(AboutContent))
            about = about_result.scalars().first()
            auto_text = "您的留言已收到，感谢您的支持与反馈！管理员将尽快回复您。"
            if about and about.auto_reply_text:
                auto_text = about.auto_reply_text

            system_reply = Message(
                content="",
                contact="",
                author_id=current_user.id,
                is_read=True,
                reply=f"__SYSTEM__{auto_text}",
            )
            db.add(system_reply)
            await db.flush()

    formatted = await _format_messages([message], db, current_user.id if current_user else None)
    return formatted[0]


@router.get("/my", response_model=list[MessageOut])
async def get_my_messages(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的所有留言（含个人系统回复）"""
    result = await db.execute(
        select(Message).where(
            Message.author_id == current_user.id,
        ).order_by(Message.created_at.desc())
    )
    messages = result.scalars().all()
    return await _format_messages(messages, db, current_user.id)


# ========== 互动 API ==========

@router.post("/{message_id}/like")
async def like_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """点赞/取消点赞"""
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalars().first()
    if not message:
        raise HTTPException(status_code=404, detail="留言不存在")

    like_users = []
    try:
        like_users = json.loads(message.like_users) if message.like_users else []
    except (json.JSONDecodeError, TypeError):
        pass

    uid = str(current_user.id)
    if uid in [str(u) for u in like_users]:
        like_users = [u for u in like_users if str(u) != uid]
        message.like_count = max(0, message.like_count - 1)
        action = "unliked"
    else:
        like_users.append(current_user.id)
        message.like_count += 1
        action = "liked"

    message.like_users = json.dumps(like_users, ensure_ascii=False)
    await db.flush()
    return {"action": action, "like_count": message.like_count}


@router.post("/{message_id}/reply", response_model=MessageOut, status_code=201)
async def reply_message(
    message_id: int,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """公开回复留言"""
    result = await db.execute(select(Message).where(Message.id == message_id))
    parent_msg = result.scalars().first()
    if not parent_msg:
        raise HTTPException(status_code=404, detail="留言不存在")

    reply = Message(
        content=data.content,
        contact="",
        author_id=current_user.id if current_user else None,
        parent_id=message_id,
    )
    db.add(reply)
    await db.flush()

    formatted = await _format_messages([reply], db, current_user.id if current_user else None)
    return formatted[0]


@router.get("/{message_id}/replies", response_model=list[MessageOut])
async def get_message_replies(
    message_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取留言的所有回复"""
    result = await db.execute(
        select(Message).where(Message.parent_id == message_id)
        .order_by(Message.created_at.asc())
    )
    replies = result.scalars().all()
    return await _format_messages(replies, db)


# ========== 管理员 API ==========

@router.get("/admin/list", response_model=list[MessageOut])
async def admin_list_messages(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """管理员查看所有留言"""
    result = await db.execute(
        select(Message).where(Message.parent_id.is_(None))
        .order_by(Message.created_at.desc())
    )
    messages = result.scalars().all()
    return await _format_messages(messages, db)


@router.delete("/{message_id}")
async def delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """管理员删除留言（同时删除其回复）"""
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalars().first()
    if not message:
        raise HTTPException(status_code=404, detail="留言不存在")

    # 同时删除该留言的所有回复
    replies = await db.execute(select(Message).where(Message.parent_id == message_id))
    for reply in replies.scalars().all():
        await db.delete(reply)

    await db.delete(message)
    return {"detail": "删除成功"}
