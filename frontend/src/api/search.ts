/** 全局搜索 API */

import request from "./request";

export interface SearchResultItem {
  id: number;
  title: string;
  type: string; // article / tool / standard / faq
  summary: string;
  url: string;
}

export interface SearchResult {
  query: string;
  total: number;
  items: SearchResultItem[];
}

export function globalSearch(q: string): Promise<{ data: SearchResult }> {
  return request.get("/search", { params: { q } });
}
