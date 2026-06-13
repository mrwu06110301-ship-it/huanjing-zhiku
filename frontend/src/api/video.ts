/** 学习视频 API */

import request from "./request";
import type { VideoOut, PaginatedResult } from "@/types";

export function getVideos(params: {
  page?: number;
  page_size?: number;
  video_type?: string;
  category_id?: number;
}): Promise<{ data: PaginatedResult<VideoOut> }> {
  return request.get("/videos", { params });
}

export function getVideo(id: number): Promise<{ data: VideoOut }> {
  return request.get(`/videos/${id}`);
}
