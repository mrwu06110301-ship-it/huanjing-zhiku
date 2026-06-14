"""文件上传路由"""

import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

# 上传目录：backend/uploads/（与 Nginx 静态服务一致）
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/upload", tags=["文件上传"])

ALLOWED_TYPES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}
MAX_SIZE = 10 * 1024 * 1024  # 10MB


class UploadResponse(BaseModel):
    url: str
    filename: str


@router.post("/image", response_model=UploadResponse)
async def upload_image(file: UploadFile = File(...)):
    """上传图片"""
    # 校验文件类型
    ext = os.path.splitext(file.filename or "image.png")[1].lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}，仅支持 {', '.join(ALLOWED_TYPES)}")

    # 读取文件内容并校验大小
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail=f"文件过大，最大支持 10MB")

    # 生成唯一文件名
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(file_path, "wb") as f:
        f.write(content)

    # 返回可访问 URL
    url = f"/uploads/{unique_name}"
    return UploadResponse(url=url, filename=unique_name)
