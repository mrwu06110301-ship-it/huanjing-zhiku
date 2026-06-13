/** 分类 API */

import request from "./request";
import type { CategoryOut } from "@/types";

export function getCategories(module?: string, all = false): Promise<{ data: CategoryOut[] }> {
  return request.get("/categories", { params: { ...(module ? { module } : {}), ...(all ? { all: true } : {}) } });
}

export function createCategory(data: {
  module: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sort_order?: number;
}): Promise<{ data: CategoryOut }> {
  return request.post("/categories", data);
}

export function updateCategory(
  id: number,
  data: Partial<{
    module: string;
    name: string;
    slug: string;
    description: string;
    icon: string;
    sort_order: number;
    is_active: boolean;
  }>
): Promise<{ data: CategoryOut }> {
  return request.put(`/categories/${id}`, data);
}

export function deleteCategory(id: number): Promise<{ data: { detail: string } }> {
  return request.delete(`/categories/${id}`);
}
