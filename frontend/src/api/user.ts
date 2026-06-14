/** 用户 API */

import request from "./request";
import type { UserOut } from "@/types";

export function register(data: {
  username: string;
  email?: string;
  password: string;
  nickname?: string;
}): Promise<{ data: { access_token: string } }> {
  return request.post("/users/register", data);
}

export function login(data: {
  username: string;
  password: string;
}): Promise<{ data: { access_token: string } }> {
  return request.post("/users/login", data);
}

export function getMe(): Promise<{ data: UserOut }> {
  return request.get("/users/me");
}

export function updateMe(data: {
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
}): Promise<{ data: UserOut }> {
  return request.put("/users/me", data);
}

export function changePassword(data: {
  old_password: string;
  new_password: string;
}) {
  return request.put("/users/me/password", data);
}

export function getUserList(params?: {
  page?: number;
  page_size?: number;
}): Promise<{ data: UserOut[] }> {
  return request.get("/users/list", { params });
}

export function getUserCount(): Promise<{ data: { total: number } }> {
  return request.get("/users/count");
}
