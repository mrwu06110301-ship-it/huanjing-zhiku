<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { login as loginApi, sendSms, smsLogin, getMe } from "@/api/user";
import { ElMessage } from "element-plus";
import BrandLogo from "@/components/BrandLogo.vue";
import WechatLogin from "@/components/WechatLogin.vue";

const router = useRouter();
const auth = useAuthStore();

/** 登录方式 Tab：password / sms */
const activeTab = ref<"password" | "sms">("password");

// ==================== 密码登录 ====================
const form = ref({
  account: "",
  password: "",
});
const loading = ref(false);

async function handleLogin() {
  if (!form.value.account || !form.value.password) {
    ElMessage.warning("请输入账号和密码");
    return;
  }
  loading.value = true;
  try {
    const res = await loginApi({
      account: form.value.account.trim(),
      password: form.value.password,
    });
    await finishLogin(res.data.access_token);
  } catch (err: unknown) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response;
    ElMessage.error(resp?.data?.detail ?? "登录失败");
  } finally {
    loading.value = false;
  }
}

// ==================== 短信登录（预留：短信服务开通后启用） ====================
const SMS_ENABLED = true; // 阿里云号码认证服务已接入
const smsForm = ref({ phone: "", code: "" });
const smsLoading = ref(false);
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(smsForm.value.phone));

async function handleSendSms() {
  if (!phoneValid.value) { ElMessage.warning("请输入正确的手机号"); return; }
  if (countdown.value > 0) return;
  try {
    await sendSms(smsForm.value.phone);
    ElMessage.success("验证码已发送");
    countdown.value = 60;
    countdownTimer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0 && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    }, 1000);
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.detail || "验证码发送失败");
  }
}

async function handleSmsLogin() {
  if (!phoneValid.value) { ElMessage.warning("请输入正确的手机号"); return; }
  if (!smsForm.value.code) { ElMessage.warning("请输入验证码"); return; }
  smsLoading.value = true;
  try {
    const res = await smsLogin({ phone: smsForm.value.phone, sms_code: smsForm.value.code });
    await finishLogin(res.data.access_token);
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.detail || "登录失败");
  } finally {
    smsLoading.value = false;
  }
}

// ==================== 微信扫码登录 ====================
const wxVisible = ref(false);
function handleWechatLogin() {
  wxVisible.value = true;
}

// ==================== 登录成功统一处理 ====================
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
  router.push("/");
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <div class="auth-logo">
          <BrandLogo />
        </div>
        <h2>产品小吴知识库</h2>
        <p>让现场监测，触手可感</p>
      </div>

      <!-- 登录方式 Tab -->
      <div class="auth-tabs">
        <span
          :class="['auth-tab', { active: activeTab === 'password' }]"
          @click="activeTab = 'password'"
        >密码登录</span>
        <span class="tab-divider">|</span>
        <span
          :class="['auth-tab', { active: activeTab === 'sms' }]"
          @click="activeTab = 'sms'"
        >短信登录</span>
      </div>

      <!-- 密码登录表单 -->
      <el-form v-if="activeTab === 'password'" :model="form" @keyup.enter="handleLogin">
        <el-form-item>
          <el-input
            v-model="form.account"
            placeholder="请输入账号（用户名 / 手机号）"
            size="large"
          >
            <template #prefix><span class="field-label">账号</span></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password
          >
            <template #prefix><span class="field-label">密码</span></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" @click="handleLogin" style="width: 100%">
            登录
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 短信登录表单（预留） -->
      <el-form v-else @keyup.enter="handleSmsLogin">
        <el-form-item>
          <el-input v-model="smsForm.phone" placeholder="请输入手机号" size="large" maxlength="11">
            <template #prefix><span class="field-label">手机号</span></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <div class="sms-row">
            <el-input v-model="smsForm.code" placeholder="请输入验证码" size="large" maxlength="6">
              <template #prefix><span class="field-label">验证码</span></template>
            </el-input>
            <el-button
              type="primary" plain size="large" class="sms-btn"
              :disabled="countdown > 0" @click="handleSendSms"
            >{{ countdown > 0 ? `${countdown}s 后重发` : "获取验证码" }}</el-button>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="smsLoading" @click="handleSmsLogin" style="width: 100%">
            登录 / 注册
          </el-button>
        </el-form-item>
        <div v-if="!SMS_ENABLED" class="sms-hint">短信登录暂未开放，当前请使用密码登录</div>
      </el-form>

      <!-- 注册 + 其他方式登录 -->
      <div class="alt-row">
        <button class="alt-btn register" @click="router.push('/register')">注册</button>
        <button class="alt-btn wechat" @click="handleWechatLogin">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="margin-right:6px">
            <path d="M8.69 3.5C4.98 3.5 2 6.05 2 9.2c0 1.77.96 3.35 2.46 4.4l-.62 1.85 2.16-1.08c.56.15 1.15.24 1.76.26a5.3 5.3 0 0 1-.21-1.48c0-3 2.87-5.44 6.4-5.44.22 0 .43.01.64.03C14.14 5.43 11.7 3.5 8.69 3.5zM6.4 6.5a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7zm4.6 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7zm3.99 2.21c-3.06 0-5.54 2.05-5.54 4.58 0 2.53 2.48 4.58 5.54 4.58.5 0 .99-.06 1.45-.17l1.86.93-.53-1.59c1.29-.87 2.12-2.2 2.12-3.75 0-2.53-2.49-4.58-5.55-4.58h.65zm-2.1 2.04a.72.72 0 1 1 0 1.44.72.72 0 0 1 0-1.44zm3.5 0a.72.72 0 1 1 0 1.44.72.72 0 0 1 0-1.44z"/>
          </svg>
          微信登录
        </button>
      </div>

      <!-- 协议 -->
      <p class="agreement">
        未注册的手机号，验证通过后将自动注册账号<br />
        登录或完成注册即代表你同意
        <router-link to="/terms" target="_blank">用户协议</router-link>
        和
        <router-link to="/privacy" target="_blank">隐私政策</router-link>
      </p>

      <div class="auth-footer">
        <span>还没有账号？</span>
        <router-link to="/register">立即注册</router-link>
      </div>

      <WechatLogin v-model:visible="wxVisible" @success="router.push('/')" />
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  position: relative;
  overflow: hidden;
}

.auth-page::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(0, 184, 217, 0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 80%, rgba(0, 230, 168, 0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(91, 124, 250, 0.04) 0%, transparent 50%);
  pointer-events: none;
  animation: bg-drift 20s ease-in-out infinite alternate;
}

@keyframes bg-drift {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(2%, 2%) rotate(3deg); }
}

.auth-card {
  width: 420px;
  background: var(--white);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  padding: 40px 36px 28px;
  position: relative;
  z-index: 1;
  border: 1px solid var(--border-light);
  animation: fadeInUp 0.6s var(--ease);
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.auth-header {
  text-align: center;
  margin-bottom: 24px;
}

.auth-logo {
  width: 68px;
  height: 68px;
  margin: 0 auto 14px;
  background: var(--gradient-primary);
  border-radius: 18px;
  padding: 12px;
  box-shadow: 0 6px 24px var(--primary-glow);
  transition: transform 0.3s var(--ease);
}

.auth-logo:hover {
  transform: scale(1.05) rotate(-3deg);
}

.auth-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
  letter-spacing: 2px;
}

.auth-header p {
  font-size: 13px;
  color: var(--text-light);
}

/* 登录方式 Tab */
.auth-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin-bottom: 22px;
}
.auth-tab {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-light);
  cursor: pointer;
  padding-bottom: 4px;
  transition: all 0.2s;
}
.auth-tab.active {
  color: var(--primary);
}
.tab-divider {
  color: var(--border);
}

.field-label {
  display: inline-block;
  width: 52px;
  font-size: 14px;
  color: var(--text);
  font-weight: 500;
}

/* 短信行 */
.sms-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.sms-row .el-input { flex: 1; }
.sms-btn { flex-shrink: 0; width: 118px; }
.sms-hint {
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
  margin-top: -6px;
}

/* 注册 + 微信登录行 */
.alt-row {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}
.alt-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s var(--ease);
  border: 1px solid var(--border);
  background: var(--white);
  color: var(--text);
}
.alt-btn.register:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.alt-btn.wechat {
  color: #07c160;
  border-color: rgba(7, 193, 96, 0.35);
  background: rgba(7, 193, 96, 0.04);
}
.alt-btn.wechat:hover {
  background: rgba(7, 193, 96, 0.1);
}

/* 协议 */
.agreement {
  margin-top: 18px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-muted);
  text-align: center;
}
.agreement a {
  color: var(--primary);
  font-weight: 600;
}
.agreement a:hover {
  text-decoration: underline;
}

.auth-footer {
  text-align: center;
  margin-top: 14px;
  font-size: 14px;
  color: var(--text-light);
}

.auth-footer a {
  color: var(--primary);
  margin-left: 6px;
  font-weight: 600;
  transition: color 0.2s;
}

.auth-footer a:hover {
  color: var(--accent);
}

@media (max-width: 768px) {
  .auth-page { padding: 20px 16px; }
  .auth-card { width: 100%; padding: 28px 22px 22px; }
  .auth-logo { width: 56px; height: 56px; padding: 10px; }
  .auth-header h2 { font-size: 20px; }
  .field-label { width: 44px; font-size: 13px; }
}
</style>
