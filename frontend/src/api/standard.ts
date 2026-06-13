/** 方法标准 API */

import request from "./request";
import type { StandardOut, PaginatedResult } from "@/types";

export function getStandards(params: {
  page?: number;
  page_size?: number;
  std_type?: string;
  category_id?: number;
}): Promise<{ data: PaginatedResult<StandardOut> }> {
  return request.get("/standards", { params });
}

export function getStandard(id: number): Promise<{ data: StandardOut }> {
  return request.get(`/standards/${id}`);
}
