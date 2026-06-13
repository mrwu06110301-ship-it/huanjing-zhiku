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
