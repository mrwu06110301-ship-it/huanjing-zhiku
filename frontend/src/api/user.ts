/** 用户 API */

import request from "./request";
import type { UserOut } from "@/types";

export function register(data: {
  username: string;
  email: string;
  password: string;
  nickname?: string;
}) {
  return request.post("/users/register", data);
}

export function login(data: { username: string; password: string }) {
  return request.post("/users/login", data);
}

export function getMe(): Promise<{ data: UserOut }> {
  return request.get("/users/me");
}

export function getUser(userId: number): Promise<{ data: UserOut }> {
  return request.get(`/users/${userId}`);
}
