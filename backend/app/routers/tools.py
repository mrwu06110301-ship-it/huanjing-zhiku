"""常用工具路由"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.tool import Tool
from app.schemas.tool import ToolOut
from app.dependencies.auth import require_admin

router = APIRouter(prefix="/api/tools", tags=["常用工具"])


@router.get("", response_model=list[ToolOut])
async def list_tools(
    tool_type: str | None = None,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Tool).where(Tool.is_public == True)
    if tool_type:
        query = query.where(Tool.tool_type == tool_type)
    if category:
        query = query.where(Tool.category == category)
    query = query.order_by(Tool.sort_order, Tool.id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{tool_id}", response_model=ToolOut)
async def get_tool(tool_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tool).where(Tool.id == tool_id))
    tool = result.scalars().first()
    if not tool:
        raise HTTPException(status_code=404, detail="工具不存在")
    return tool


@router.get("/slug/{slug}", response_model=ToolOut)
async def get_tool_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tool).where(Tool.slug == slug))
    tool = result.scalars().first()
    if not tool:
        raise HTTPException(status_code=404, detail="工具不存在")
    return tool


@router.post("", response_model=ToolOut, status_code=201)
async def create_tool(
    name: str,
    slug: str,
    description: str = "",
    icon: str = "",
    tool_type: str = "model",
    category: str = "",
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    tool = Tool(name=name, slug=slug, description=description,
                icon=icon, tool_type=tool_type, category=category)
    db.add(tool)
    await db.flush()
    await db.refresh(tool)
    return tool


@router.delete("/{tool_id}")
async def delete_tool(
    tool_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(select(Tool).where(Tool.id == tool_id))
    tool = result.scalars().first()
    if not tool:
        raise HTTPException(status_code=404, detail="工具不存在")
    await db.delete(tool)
    return {"detail": "删除成功"}
