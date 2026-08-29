/** 常用工具 API */

import request from "./request";
import type { ToolOut } from "@/types";

export function getTools(params?: {
  tool_type?: string;
  category?: string;
}): Promise<{ data: ToolOut[] }> {
  return request.get("/tools", { params });
}

export function getTool(id: number): Promise<{ data: ToolOut }> {
  return request.get(`/tools/${id}`);
}

export function getToolBySlug(slug: string): Promise<{ data: ToolOut }> {
  return request.get(`/tools/slug/${slug}`);
}

// ===== 管理端 =====

/** 全量列表（含未公开），仅管理员 */
export function getToolsAdmin(): Promise<{ data: ToolOut[] }> {
  return request.get("/tools/admin/all");
}

export function updateTool(id: number, data: Partial<{
  name: string;
  slug: string;
  description: string;
  icon: string;
  tool_type: string;
  category: string;
  is_public: boolean;
  sort_order: number;
}>): Promise<{ data: ToolOut }> {
  return request.put(`/tools/${id}`, data);
}

export function createTool(data: {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  tool_type?: string;
  category?: string;
}): Promise<{ data: ToolOut }> {
  return request.post("/tools", null, { params: data });
}

export function deleteTool(id: number) {
  return request.delete(`/tools/${id}`);
}
