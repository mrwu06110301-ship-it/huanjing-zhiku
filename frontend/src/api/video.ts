/** 学习视频 API */

import request from "./request";
import type { PaginatedResult } from "@/types";

export interface VideoOut {
  id: number;
  title: string;
  description: string;
  cover_image: string;
  video_url: string;
  embed_url: string;
  video_type: string;
  category_id: number | null;
  category_name: string | null;
  category_color?: string;
  tags: string[];
  duration: string;
  is_public: boolean;
  is_featured: boolean;
  view_count: number;
  author_name: string;
  created_at: string;
}

export function getVideos(params: {
  page?: number;
  page_size?: number;
  video_type?: string;
  category_id?: number;
}): Promise<{ data: PaginatedResult<VideoOut> }> {
  return request.get("/videos", { params });
}

export function getFeaturedVideos(): Promise<{ data: VideoOut[] }> {
  return request.get("/videos/featured");
}

export function getRecommendedVideos(): Promise<{ data: VideoOut[] }> {
  return request.get("/videos/recommended");
}

export function getVideo(id: number): Promise<{ data: VideoOut }> {
  return request.get(`/videos/${id}`);
}

export function createVideo(data: Partial<VideoOut> & { title: string }): Promise<{ data: VideoOut }> {
  return request.post("/videos", data);
}

export function updateVideo(id: number, data: Partial<VideoOut>): Promise<{ data: VideoOut }> {
  return request.put(`/videos/${id}`, data);
}

export function deleteVideo(id: number): Promise<{ data: any }> {
  return request.delete(`/videos/${id}`);
}

export function toggleFeatured(id: number): Promise<{ data: VideoOut }> {
  return request.post(`/videos/${id}/toggle-featured`);
}

export function checkUploadPermission(): Promise<{ data: { can_upload: boolean } }> {
  return request.get("/videos/upload-permission/check");
}

export function setUploadPermission(userId: number, canUpload: boolean): Promise<{ data: any }> {
  return request.put(`/videos/upload-permission/${userId}`, null, {
    params: { can_upload: canUpload },
  });
}
