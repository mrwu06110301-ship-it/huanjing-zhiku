<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { ElMessage } from "element-plus";
import request from "@/api/request";
import { useAuthStore } from "@/stores/auth";
import { getMe } from "@/api/user";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "update:visible", v: boolean): void; (e: "success"): void }>();

const auth = useAuthStore();
const loading = ref(false);
const qrcodeUrl = ref("");
const pollTimer: ReturnType<typeof setInterval> | null = null;

/** 生成扫码页并打开弹窗式轮询窗口 */
async function openQrcode() {
  loading.value = true;
  try {
    const res = await request.get("/users/wechat/qrcode");
    qrcodeUrl.value = res.data.qrcode_url;
    // 打开扫码窗口：新窗口完成授权后回跳 /wechat/callback，回调页处理 token 传递
    window.open(res.data.qrcode_url, "wechat_login", "width=520,height=620");
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.detail || "微信登录暂不可用");
  } finally {
    loading.value = false;
  }
}

/** 监听回调页 postMessage（callback 页拿到 token 后 post 给本窗口） */
function onMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === "wechat_login_success" && event.data.token) {
    finishLogin(event.data.token);
  } else if (event.data?.type === "wechat_login_error") {
    ElMessage.error(event.data.detail || "微信授权失败");
  }
}

async function finishLogin(token: string) {
  auth.token = token;
  localStorage.setItem("hjzk_token", token);
  try {
    const meRes = await getMe();
    auth.setLogin(token, meRes.data);
  } catch {
    auth.setLogin(token, {} as any);
  }
  ElMessage.success("登录成功");
  emit("success");
  emit("update:visible", false);
}

watch(
  () => props.visible,
  (v) => {
    if (v) openQrcode();
  }
);

onMounted(() => window.addEventListener("message", onMessage));
onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="微信扫码登录"
    width="360px"
    align-center
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <div class="wx-dialog-body">
      <p class="wx-tip">请使用微信扫描二维码完成登录</p>
      <div v-if="loading" class="wx-loading" v-loading="loading" />
      <div v-else-if="qrcodeUrl" class="wx-actions">
        <el-button type="primary" @click="openQrcode">重新打开扫码窗口</el-button>
        <p class="wx-sub">扫码窗口未显示？点击按钮重新打开</p>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.wx-dialog-body { text-align: center; padding: 8px 0 16px; }
.wx-tip { font-size: 14px; color: var(--text); margin-bottom: 16px; }
.wx-loading { height: 120px; }
.wx-actions { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.wx-sub { font-size: 12px; color: var(--text-light); }
</style>
