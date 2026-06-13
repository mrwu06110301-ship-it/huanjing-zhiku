/** 评论 API */

import request from "./request";
import type { CommentOut } from "@/types";

export function getComments(articleId: number): Promise<{ data: CommentOut[] }> {
  return request.get(`/comments/article/${articleId}`);
}

export function addComment(articleId: number, content: string) {
  return request.post(`/comments/article/${articleId}`, { content });
}

export function deleteComment(id: number) {
  return request.delete(`/comments/${id}`);
}
