<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { register, sendSms, getMe } from "@/api/user";
import { ElMessage } from "element-plus";
import BrandLogo from "@/components/BrandLogo.vue";

const router = useRouter();
const auth = useAuthStore();

/** 注册方式 Tab：account（账号密码）/ phone（手机号，预留） */
const activeTab = ref<"account" | "phone">("account");

// ==================== 账号密码注册 ====================
const form = ref({
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  nickname: "",
});
const loading = ref(false);
const agreed = ref(false);

function checkAgreement(): boolean {
  if (!agreed.value) {
    ElMessage.warning("请先阅读并同意用户协议和隐私政策");
    return false;
  }
  return true;
}

async function handleRegister() {
  if (!checkAgreement()) return;
  if (!form.value.username || !form.value.password) {
    ElMessage.warning("请输入用户名和密码");
    return;
  }
  if (form.value.password !== form.value.confirmPassword) {
    ElMessage.warning("两次密码不一致");
    return;
  }
  loading.value = true;
  try {
    const res = await register({
      username: form.value.username.trim(),
      email: form.value.email.trim() || undefined,
      password: form.value.password,
      nickname: form.value.nickname.trim(),
    });
    await finishRegister(res.data.access_token);
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.detail || "注册失败");
  } finally {
    loading.value = false;
  }
}

// ==================== 手机号注册（预留：短信服务开通后启用） ====================
const SMS_ENABLED = false; // 短信认证服务开通后改为 true
const phoneForm = ref({ phone: "", code: "", password: "" });
const smsLoading = ref(false);
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(phoneForm.value.phone));

async function handleSendSms() {
  if (!phoneValid.value) { ElMessage.warning("请输入正确的手机号"); return; }
  if (countdown.value > 0) return;
  try {
    await sendSms(phoneForm.value.phone);
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

async function handlePhoneRegister() {
  if (!checkAgreement()) return;
  if (!phoneValid.value) { ElMessage.warning("请输入正确的手机号"); return; }
  if (!phoneForm.value.code) { ElMessage.warning("请输入验证码"); return; }
  smsLoading.value = true;
  try {
    // 预留：短信服务开通后走 phone+sms_code 注册链路
    ElMessage.info("短信注册暂未开放，敬请期待");
  } finally {
    smsLoading.value = false;
  }
}

// ==================== 注册成功统一处理 ====================
async function finishRegister(token: string) {
  auth.token = token;
  localStorage.setItem("hjzk_token", token);
  try {
    const meRes = await getMe();
    auth.setLogin(token, meRes.data);
  } catch {
    auth.setLogin(token, {} as any);
  }
  ElMessage.success("注册成功");
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
        <h2>注册账号</h2>
        <p>加入产品小吴知识库社区</p>
      </div>

      <!-- 注册方式 Tab -->
      <div class="auth-tabs">
        <span
          :class="['auth-tab', { active: activeTab === 'account' }]"
          @click="activeTab = 'account'"
        >账号注册</span>
        <span class="tab-divider">|</span>
        <span
          :class="['auth-tab', { active: activeTab === 'phone' }]"
          @click="activeTab = 'phone'"
        >手机号注册</span>
      </div>

      <!-- 账号密码注册 -->
      <el-form v-if="activeTab === 'account'" @keyup.enter="handleRegister">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名（3-50 个字符）" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.nickname" placeholder="昵称（可选）" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.email" placeholder="邮箱（可选）" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码（至少 6 位）" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.confirmPassword" type="password" placeholder="确认密码" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" @click="handleRegister" style="width: 100%">
            注册
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 手机号注册（预留） -->
      <el-form v-else @keyup.enter="handlePhoneRegister">
        <el-form-item>
          <el-input v-model="phoneForm.phone" placeholder="请输入手机号" size="large" maxlength="11" />
        </el-form-item>
        <el-form-item>
          <div class="sms-row">
            <el-input v-model="phoneForm.code" placeholder="请输入验证码" size="large" maxlength="6" />
            <el-button
              type="primary" plain size="large" class="sms-btn"
              :disabled="countdown > 0" @click="handleSendSms"
            >{{ countdown > 0 ? `${countdown}s 后重发` : "获取验证码" }}</el-button>
          </div>
        </el-form-item>
        <el-form-item>
          <el-input v-model="phoneForm.password" type="password" placeholder="设置密码（至少 6 位）" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="smsLoading" @click="handlePhoneRegister" style="width: 100%">
            注册
          </el-button>
        </el-form-item>
        <div v-if="!SMS_ENABLED" class="sms-hint">短信注册暂未开放，当前请使用账号注册</div>
      </el-form>

      <!-- 协议勾选 -->
      <label class="agree-row">
        <input v-model="agreed" type="checkbox" class="agree-check" />
        <span>
          我已阅读并同意
          <router-link to="/terms" target="_blank">用户协议</router-link>
          和
          <router-link to="/privacy" target="_blank">隐私政策</router-link>
        </span>
      </label>

      <div class="auth-footer">
        <span>已有账号？</span>
        <router-link to="/login">立即登录</router-link>
      </div>
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
  padding: 40px 36px 26px;
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

/* 注册方式 Tab */
.auth-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin-bottom: 20px;
}
.auth-tab {
  font-size: 16px;
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

/* 协议勾选 */
.agree-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 4px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}
.agree-check {
  margin-top: 3px;
  width: 14px;
  height: 14px;
  accent-color: var(--primary);
  cursor: pointer;
  flex-shrink: 0;
}
.agree-row a {
  color: var(--primary);
  font-weight: 600;
}
.agree-row a:hover {
  text-decoration: underline;
}

.auth-footer {
  text-align: center;
  margin-top: 16px;
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
  .auth-card { width: 100%; padding: 28px 22px 20px; }
  .auth-logo { width: 56px; height: 56px; padding: 10px; }
  .auth-header h2 { font-size: 20px; }
}
</style>
