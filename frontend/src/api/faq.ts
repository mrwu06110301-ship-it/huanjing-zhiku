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
