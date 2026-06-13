/** 认证状态管理 */

import { defineStore } from "pinia";
import { ref } from "vue";
import type { UserOut } from "@/types";

export const useAuthStore = defineStore("auth", () => {
  const token = ref(localStorage.getItem("hjzk_token") || "");
  const user = ref<UserOut | null>(null);

  function setLogin(t: string, u: UserOut) {
    token.value = t;
    user.value = u;
    localStorage.setItem("hjzk_token", t);
  }

  function logout() {
    token.value = "";
    user.value = null;
    localStorage.removeItem("hjzk_token");
  }

  const isLoggedIn = () => !!token.value;
  const isAdmin = () => user.value?.role === "admin";

  return { token, user, setLogin, logout, isLoggedIn, isAdmin };
});
