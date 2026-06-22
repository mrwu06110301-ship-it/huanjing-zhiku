"""环监智库 — FastAPI 应用入口"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import users, articles, comments, categories, videos, standards, faqs, tools, about, messages, search, upload, video_comments, carousel

# 必须导入所有模型，否则 Base.metadata 为空，create_all 不创建任何表
import app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库 + 种子数据"""
    await init_db()
    await _seed_data()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description=f"{settings.APP_SLOGAN}",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(users.router)
app.include_router(articles.router)
app.include_router(comments.router)
app.include_router(categories.router)
app.include_router(videos.router)
app.include_router(standards.router)
app.include_router(faqs.router)
app.include_router(tools.router)
app.include_router(about.router)
app.include_router(messages.router)
app.include_router(search.router)
app.include_router(upload.router)
app.include_router(video_comments.router)
app.include_router(carousel.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}


async def _seed_data():
    """初始化种子数据：管理员账号、分类、工具"""
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.user import User
    from app.models.category import Category
    from app.models.tool import Tool
    from app.services.auth import hash_password

    async with async_session_factory() as session:
        # 1. 管理员账号
        result = await session.execute(select(User).where(User.username == "admin"))
        if not result.scalars().first():
            admin = User(
                username="admin",
                email="admin@hjzk.com",
                nickname="管理员",
                role="admin",
                hashed_password=hash_password("admin123"),
            )
            session.add(admin)

        # 2. 论坛分类
        forum_cats = [
            ("forum", "数智化畅享", "digital", "💻"),
            ("forum", "案例分享", "cases", "📋"),
            ("forum", "技术分享", "tech-share", "🔧"),
            ("forum", "行业动态", "industry", "📰"),
            ("video", "知识科普", "popularization", "🎓"),
            ("video", "实操演示", "demo", "🎥"),
            ("video", "技术探讨", "discussion", "🔬"),
            ("standard", "标准文档", "document", "📄"),
            ("standard", "标准解读", "interpretation", "📖"),
            ("standard", "选型手册", "selection-guide", "📊"),
            ("faq", "现场常见问题", "onsite", "🏗️"),
            ("faq", "用户提问", "user-question", "❓"),
            ("faq", "设备问题", "equipment", "⚙️"),
            ("faq", "维修维护指南", "maintenance", "🛠️"),
        ]
        for module, name, slug, _icon in forum_cats:
            result = await session.execute(select(Category).where(Category.slug == slug))
            if not result.scalars().first():
                session.add(Category(module=module, name=name, slug=slug))

        # 3. 常用工具
        tools_data = [
            ("大气稳定度计算", "atmospheric-stability", "🌡️", "calculator", "大气监测"),
            ("单位换算", "unit-converter", "🔄", "converter", "通用工具"),
            ("大气采样模型", "air-sampling-model", "💨", "model", "大气监测"),
            ("污染源采样模型", "pollution-source-model", "🏭", "model", "污染源监测"),
            ("烟道布点模型", "flue-sampling", "📏", "model", "废气监测"),
            ("紫外差分计算模型", "doas-model", "🔬", "model", "光学监测"),
        ]
        for name, slug, icon, tool_type, category in tools_data:
            result = await session.execute(select(Tool).where(Tool.slug == slug))
            if not result.scalars().first():
                session.add(Tool(
                    name=name, slug=slug, icon=icon,
                    tool_type=tool_type, category=category,
                    description=f"{name} — 功能开发中",
                ))

        await session.commit()
