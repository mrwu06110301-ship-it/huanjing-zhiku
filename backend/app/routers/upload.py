"""文件上传路由"""

import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

# 上传目录：backend/uploads/（与 Nginx 静态服务一致）
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/upload", tags=["文件上传"])

IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}
IMAGE_MAX_SIZE = 10 * 1024 * 1024  # 10MB

VIDEO_TYPES = {".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv", ".wmv"}
VIDEO_MAX_SIZE = 500 * 1024 * 1024  # 500MB


class UploadResponse(BaseModel):
    url: str
    filename: str


@router.post("/image", response_model=UploadResponse)
async def upload_image(file: UploadFile = File(...)):
    """上传图片"""
    ext = os.path.splitext(file.filename or "image.png")[1].lower()
    if ext not in IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}，仅支持 {', '.join(IMAGE_TYPES)}")

    content = await file.read()
    if len(content) > IMAGE_MAX_SIZE:
        raise HTTPException(status_code=400, detail=f"文件过大，最大支持 10MB")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(file_path, "wb") as f:
        f.write(content)

    url = f"/uploads/{unique_name}"
    return UploadResponse(url=url, filename=unique_name)


@router.post("/video", response_model=UploadResponse)
async def upload_video(file: UploadFile = File(...)):
    """上传视频文件"""
    ext = os.path.splitext(file.filename or "video.mp4")[1].lower()
    if ext not in VIDEO_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}，仅支持 {', '.join(VIDEO_TYPES)}")

    # 流式写入，不全部读入内存
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    size = 0
    with open(file_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)  # 1MB chunks
            if not chunk:
                break
            f.write(chunk)
            size += len(chunk)
            if size > VIDEO_MAX_SIZE:
                f.close()
                os.remove(file_path)
                raise HTTPException(status_code=400, detail=f"文件过大，最大支持 500MB")

    url = f"/uploads/{unique_name}"
    return UploadResponse(url=url, filename=unique_name)
