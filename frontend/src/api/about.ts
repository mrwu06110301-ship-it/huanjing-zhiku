/** 关于作者 API */

import request from "./request";

export interface AboutOut {
  id: number;
  content: string;
  images: string; // JSON 字符串
  auto_reply_text: string;
  updated_at: string | null;
}

export function getAbout(): Promise<{ data: AboutOut }> {
  return request.get("/about");
}

export function updateAbout(data: { content: string; images: string; auto_reply_text?: string }): Promise<{ data: AboutOut }> {
  return request.put("/about", data);
}
