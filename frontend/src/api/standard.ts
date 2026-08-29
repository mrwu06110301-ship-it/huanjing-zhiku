/** 方法标准 API */

import request from "./request";
import type { StandardOut, PaginatedResult } from "@/types";

export function getStandards(params: {
  page?: number;
  page_size?: number;
  std_type?: string;
  category_id?: number;
  keyword?: string;
}): Promise<{ data: PaginatedResult<StandardOut> }> {
  return request.get("/standards", { params });
}

export function getStandard(id: number): Promise<{ data: StandardOut }> {
  return request.get(`/standards/${id}`);
}

export interface BatchUploadResult {
  created: StandardOut[];
  failed: { file: string; reason: string }[];
  success_count: number;
  fail_count: number;
}

/** 批量上传标准文件（PDF/Word 等），选分类后一次提交 */
export function uploadStandardsBatch(
  files: File[],
  categoryId: number
): Promise<{ data: BatchUploadResult }> {
  const fd = new FormData();
  fd.append("category_id", String(categoryId));
  files.forEach((f) => fd.append("files", f));
  return request.post("/standards/upload-batch", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600000,
  });
}

/** 删除标准（仅管理员），同时清理物理文件 */
export function deleteStandard(id: number): Promise<{ data: { detail: string } }> {
  return request.delete(`/standards/${id}`);
}
