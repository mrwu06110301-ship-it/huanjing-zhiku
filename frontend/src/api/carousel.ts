/** 轮播图 API */

import request from "./request";

export interface CarouselSlide {
  id: number;
  image_url: string;
  title: string;
  link_video_id: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string | null;
}

export function getCarousel(): Promise<{ data: CarouselSlide[] }> {
  return request.get("/carousel");
}

export function getAdminCarousel(): Promise<{ data: CarouselSlide[] }> {
  return request.get("/carousel/admin");
}

export function createCarousel(data: {
  image_url: string;
  title?: string;
  link_video_id?: number | null;
  sort_order?: number;
}): Promise<{ data: CarouselSlide }> {
  return request.post("/carousel", data);
}

export function updateCarousel(
  id: number,
  data: Partial<CarouselSlide>
): Promise<{ data: CarouselSlide }> {
  return request.put(`/carousel/${id}`, data);
}

export function deleteCarousel(id: number): Promise<{ data: any }> {
  return request.delete(`/carousel/${id}`);
}
