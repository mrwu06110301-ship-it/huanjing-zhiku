/** 文件上传 API */

import request from "./request";

export function uploadImage(file: File): Promise<{ data: { url: string; filename: string } }> {
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/upload/image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function uploadVideo(file: File): Promise<{ data: { url: string; filename: string } }> {
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/upload/video", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}
