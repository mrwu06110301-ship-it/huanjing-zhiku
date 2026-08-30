/** 用户 API */

import request from "./request";
import type { UserOut } from "@/types";

export function register(data: {
  username: string;
  email?: string;
  password: string;
  nickname?: string;
  phone?: string;
  sms_code?: string;
}): Promise<{ data: { access_token: string } }> {
  return request.post("/users/register", data);
}

/** 登录：account 支持用户名/手机号/邮箱 */
export function login(data: {
  account: string;
  password: string;
}): Promise<{ data: { access_token: string } }> {
  return request.post("/users/login", data);
}

/** 发送短信验证码（预留：短信服务开通前返回 501） */
export function sendSms(phone: string): Promise<{ data: any }> {
  return request.post("/users/sms/send", { phone });
}

/** 短信验证码登录/自动注册（预留） */
export function smsLogin(data: {
  phone: string;
  sms_code: string;
}): Promise<{ data: { access_token: string } }> {
  return request.post("/users/sms/login", data);
}

/** 微信扫码授权登录（预留） */
export function wechatLogin(code: string): Promise<{ data: { access_token: string } }> {
  return request.post("/users/wechat/login", { code });
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
