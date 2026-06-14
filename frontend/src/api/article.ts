/** 文章/论坛 API */

import request from "./request";
import type { ArticleOut, ArticleListOut, PaginatedResult } from "@/types";

export function getArticles(params: {
  page?: number;
  page_size?: number;
  module?: string;
  category_id?: number;
  status?: string;
}): Promise<{ data: PaginatedResult<ArticleListOut> }> {
  return request.get("/articles", { params });
}

export function getArticle(id: number): Promise<{ data: ArticleOut }> {
  return request.get(`/articles/${id}`);
}

export function createArticle(data: Partial<ArticleOut>) {
  return request.post("/articles", data);
}

export function updateArticle(id: number, data: Partial<ArticleOut>) {
  return request.put(`/articles/${id}`, data);
}

export function deleteArticle(id: number) {
  return request.delete(`/articles/${id}`);
}

export function approveArticle(id: number) {
  return request.put(`/articles/${id}/approve`);
}

export function rejectArticle(id: number) {
  return request.put(`/articles/${id}/reject`);
}
