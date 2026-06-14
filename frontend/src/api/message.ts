/** 留言 API */

import request from "./request";

export interface MessageOut {
  id: number;
  content: string;
  contact: string;
  author_id: number | null;
  author_name: string | null;
  status: string;
  like_count: number;
  liked: boolean;
  reply: string;
  parent_id: number | null;
  created_at: string | null;
}

/** 获取公开留言（已审核通过） */
export function getMessages(params?: { page?: number; page_size?: number }): Promise<{ data: MessageOut[] }> {
  return request.get("/messages", { params });
}

/** 获取自己的留言 */
export function getMyMessages(): Promise<{ data: MessageOut[] }> {
  return request.get("/messages/my");
}

/** 管理员获取所有留言 */
export function getAdminMessages(status?: string): Promise<{ data: MessageOut[] }> {
  return request.get("/messages/admin/list", { params: { status_filter: status } });
}

/** 提交留言 */
export function createMessage(data: { content: string; contact?: string }): Promise<{ data: MessageOut }> {
  return request.post("/messages", data);
}

/** 点赞/取消点赞 */
export function likeMessage(id: number): Promise<{ data: { action: string; like_count: number } }> {
  return request.post(`/messages/${id}/like`);
}

/** 公开回复留言 */
export function replyToMessage(id: number, content: string): Promise<{ data: MessageOut }> {
  return request.post(`/messages/${id}/reply`, { content });
}

/** 获取回复列表 */
export function getMessageReplies(id: number): Promise<{ data: MessageOut[] }> {
  return request.get(`/messages/${id}/replies`);
}

/** 管理员审核通过 */
export function approveMessage(id: number): Promise<{ data: MessageOut }> {
  return request.put(`/messages/${id}/approve`);
}

/** 管理员拒绝 */
export function rejectMessage(id: number, reason?: string): Promise<{ data: any }> {
  return request.put(`/messages/${id}/reject`, { content: reason || "" });
}

/** 管理员删除 */
export function deleteMessage(id: number) {
  return request.delete(`/messages/${id}`);
}

export function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatFullDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
