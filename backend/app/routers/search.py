"""全局搜索路由"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from pydantic import BaseModel

from app.database import get_db
from app.models.article import Article
from app.models.tool import Tool
from app.models.standard import Standard
from app.models.faq import FAQ

router = APIRouter(prefix="/api/search", tags=["全局搜索"])


class SearchResultItem(BaseModel):
    id: int
    title: str
    type: str  # article / tool / standard / faq
    summary: str
    url: str


class SearchResult(BaseModel):
    query: str
    total: int
    items: list[SearchResultItem]


@router.get("", response_model=SearchResult)
async def global_search(q: str, db: AsyncSession = Depends(get_db)):
    """全局模糊搜索"""
    keyword = f"%{q}%"
    items: list[SearchResultItem] = []

    # 搜索文章
    ar = await db.execute(
        select(Article).where(
            Article.is_public == True,
            Article.status == "approved",
            or_(Article.title.like(keyword), Article.content.like(keyword), Article.summary.like(keyword)),
        ).limit(20)
    )
    for a in ar.scalars().all():
        items.append(SearchResultItem(
            id=a.id, title=a.title, type="article",
            summary=a.summary or a.content[:80] if a.content else "",
            url=f"/article/{a.id}",
        ))

    # 搜索工具
    tr = await db.execute(
        select(Tool).where(
            Tool.is_public == True,
            or_(Tool.name.like(keyword), Tool.description.like(keyword)),
        ).limit(10)
    )
    for t in tr.scalars().all():
        items.append(SearchResultItem(
            id=t.id, title=t.name, type="tool",
            summary=t.description or "",
            url=f"/tools/{t.slug}",
        ))

    # 搜索标准
    sr = await db.execute(
        select(Standard).where(
            Standard.is_public == True,
            or_(Standard.title.like(keyword), Standard.description.like(keyword)),
        ).limit(10)
    )
    for s in sr.scalars().all():
        items.append(SearchResultItem(
            id=s.id, title=s.title, type="standard",
            summary=s.description or "",
            url="/standards",
        ))

    # 搜索 FAQ
    fr = await db.execute(
        select(FAQ).where(
            FAQ.is_public == True,
            or_(FAQ.question.like(keyword), FAQ.answer.like(keyword)),
        ).limit(10)
    )
    for f in fr.scalars().all():
        items.append(SearchResultItem(
            id=f.id, title=f.question, type="faq",
            summary=f.answer[:80] if f.answer else "",
            url="/faq",
        ))

    return SearchResult(query=q, total=len(items), items=items)
