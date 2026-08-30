<script setup lang="ts">
/** 微信扫码授权回调页：接收 ?code= → 调后端换 token → postMessage 给登录页 → 关闭自身 */
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import request from "@/api/request";

const router = useRouter();

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || "";
  const opener = window.opener as Window | null;

  if (!code) {
    opener?.postMessage({ type: "wechat_login_error", detail: "未获取到微信授权码" }, window.location.origin);
    setTimeout(() => window.close(), 800);
    return;
  }
  try {
    const res = await request.post("/users/wechat/login", { code });
    opener?.postMessage({ type: "wechat_login_success", token: res.data.access_token }, window.location.origin);
    // 非弹窗场景（直接跳转）：自己完成登录并回首页
    if (!opener) {
      const { useAuthStore } = await import("@/stores/auth");
      const { getMe } = await import("@/api/user");
      const auth = useAuthStore();
      const token = res.data.access_token;
      auth.token = token;
      localStorage.setItem("hjzk_token", token);
      try { const me = await getMe(); auth.setLogin(token, me.data); } catch { auth.setLogin(token, {} as any); }
      router.push("/");
    } else {
      setTimeout(() => window.close(), 500);
    }
  } catch (err: any) {
    opener?.postMessage({ type: "wechat_login_error", detail: err?.response?.data?.detail || "微信授权失败" }, window.location.origin);
    if (!opener) router.push("/login");
    else setTimeout(() => window.close(), 800);
  }
});
</script>

<template>
  <div class="wx-callback">
    <p>微信授权处理中，请稍候…</p>
  </div>
</template>

<style scoped>
.wx-callback { min-height: 60vh; display: flex; align-items: center; justify-content: center; color: var(--text-light); font-size: 15px; }
</style>
