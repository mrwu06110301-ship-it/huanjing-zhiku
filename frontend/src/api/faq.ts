/** 常见问题 API */

import request from "./request";
import type { FAQOut, PaginatedResult } from "@/types";

export function getFAQs(params: {
  page?: number;
  page_size?: number;
  faq_type?: string;
  category_id?: number;
}): Promise<{ data: PaginatedResult<FAQOut> }> {
  return request.get("/faqs", { params });
}

export function getFAQ(id: number): Promise<{ data: FAQOut }> {
  return request.get(`/faqs/${id}`);
}

/** 新增 FAQ（问题描述 + 解决办法） */
export function createFAQ(data: {
  question: string;
  answer: string;
  faq_type?: string;
  category_id?: number | null;
  tags?: string[];
}): Promise<{ data: FAQOut }> {
  return request.post("/faqs", data);
}

/** 删除 FAQ（本人或管理员） */
export function deleteFAQ(id: number) {
  return request.delete(`/faqs/${id}`);
}

/** 编辑 FAQ（仅管理员） */
export function updateFAQ(
  id: number,
  data: {
    question?: string;
    answer?: string;
    category_id?: number | null;
    is_pinned?: boolean;
    is_public?: boolean;
  }
): Promise<{ data: FAQOut }> {
  return request.put(`/faqs/${id}`, data);
}

/** 上报 FAQ 预览计数（展开条目时调用） */
export function reportFAQView(id: number) {
  return request.post(`/faqs/${id}/view`);
}

/** 点赞/取消点赞 FAQ */
export function likeFAQ(id: number): Promise<{ data: { like_count: number; liked: boolean } }> {
  return request.post(`/faqs/${id}/like`);
}

export interface FAQCommentOut {
  id: number;
  content: string;
  faq_id: number;
  author_id: number;
  author_name: string;
  author_avatar: string;
  created_at: string;
}

/** 获取 FAQ 评论列表 */
export function getFAQComments(id: number): Promise<{ data: { items: FAQCommentOut[]; total: number } }> {
  return request.get(`/faqs/${id}/comments`);
}

/** 发表 FAQ 评论 */
export function createFAQComment(id: number, content: string): Promise<{ data: FAQCommentOut }> {
  return request.post(`/faqs/${id}/comments`, { content });
}

/** 删除 FAQ 评论（本人或管理员） */
export function deleteFAQComment(faqId: number, commentId: number) {
  return request.delete(`/faqs/${faqId}/comments/${commentId}`);
}
