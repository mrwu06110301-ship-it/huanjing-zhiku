"""数据库模型汇总 — 导入所有模型以便 Alembic / init_db 识别"""

from app.models.user import User
from app.models.category import Category
from app.models.article import Article
from app.models.comment import Comment
from app.models.video import Video
from app.models.standard import Standard
from app.models.faq import FAQ
from app.models.tool import Tool
from app.models.about import AboutContent
from app.models.message import Message
from app.models.video_comment import VideoComment
from app.models.carousel import CarouselSlide

__all__ = ["User", "Category", "Article", "Comment", "Video", "Standard", "FAQ", "Tool", "AboutContent", "Message", "VideoComment", "CarouselSlide"]
