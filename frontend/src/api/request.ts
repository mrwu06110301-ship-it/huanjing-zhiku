/** HTTP 请求封装 */

import axios from "axios";
import { useAuthStore } from "@/stores/auth";
import router from "@/router";

const request = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

// 请求拦截：自动携带 token
request.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

// 响应拦截：401 自动跳转登录
request.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const auth = useAuthStore();
      auth.logout();
      router.push("/login");
    }
    return Promise.reject(err);
  }
);

export default request;
