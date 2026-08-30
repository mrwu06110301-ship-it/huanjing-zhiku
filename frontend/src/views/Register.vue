<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { register, sendSms, checkUsername, getMe } from "@/api/user";
import { ElMessage } from "element-plus";
import BrandLogo from "@/components/BrandLogo.vue";

const router = useRouter();
const auth = useAuthStore();

/** 注册步骤：1=账号密码（预校验） → 2=手机验证码关联（验证通过才真正注册） */
const step = ref<1 | 2>(1);

// ==================== 第一步：账号密码预校验 ====================
const form = ref({
  username: "",
  password: "",
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

async function handleNext() {
  if (!checkAgreement()) return;
  if (!form.value.username || !form.value.password) {
    ElMessage.warning("请输入用户名和密码");
    return;
  }
  if (form.value.password.length < 6) {
    ElMessage.warning("密码至少 6 位");
    return;
  }
  loading.value = true;
  try {
    // 仅预校验用户名占用，不创建账号
    await checkUsername({ username: form.value.username.trim() });
    step.value = 2;
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.detail || "校验失败");
  } finally {
    loading.value = false;
  }
}

// ==================== 第二步：手机验证码关联（通过后才注册） ====================
const SMS_ENABLED = true; // 阿里云号码认证服务已接入
const phoneForm = ref({ phone: "", code: "" });
const registerLoading = ref(false);
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

async function handleRegister() {
  if (!phoneValid.value) { ElMessage.warning("请输入正确的手机号"); return; }
  if (!phoneForm.value.code) { ElMessage.warning("请输入验证码"); return; }
  registerLoading.value = true;
  try {
    // 手机验证码通过后才真正创建账号并自动登录
    const res = await register({
      username: form.value.username.trim(),
      password: form.value.password,
      phone: phoneForm.value.phone,
      sms_code: phoneForm.value.code,
    });
    auth.token = res.data.access_token;
    localStorage.setItem("hjzk_token", res.data.access_token);
    try {
      const meRes = await getMe();
      auth.setLogin(res.data.access_token, meRes.data);
    } catch {
      auth.setLogin(res.data.access_token, {} as any);
    }
    ElMessage.success("注册成功，欢迎加入！");
    router.push("/");
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.detail || "注册失败");
  } finally {
    registerLoading.value = false;
  }
}

/** 返回上一步修改账号信息 */
function backToStep1() {
  step.value = 1;
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <div class="auth-logo">
          <BrandLogo />
        </div>
        <h2>{{ step === 1 ? "注册账号" : "验证手机号" }}</h2>
        <p>{{ step === 1 ? "加入产品小吴知识库社区" : "验证通过即完成注册并自动登录" }}</p>
      </div>

      <!-- 步骤指示器 -->
      <div class="steps">
        <span :class="['step', { active: step >= 1, done: step > 1 }]">
          <i class="step-num">{{ step > 1 ? "✓" : "1" }}</i>账号密码
        </span>
        <span class="step-line" :class="{ passed: step > 1 }"></span>
        <span :class="['step', { active: step >= 2 }]">
          <i class="step-num">2</i>手机验证
        </span>
      </div>

      <!-- 第一步：账号密码（仅预校验，不创建账号） -->
      <el-form v-if="step === 1" @keyup.enter="handleNext">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名（3-50 个字符）" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码（至少 6 位）" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" @click="handleNext" style="width: 100%">
            下一步
          </el-button>
        </el-form-item>
        <div class="step-tip">下一步需通过手机验证码完成注册；昵称可登录后在个人中心补填</div>
      </el-form>

      <!-- 第二步：手机验证码，验证通过才创建账号 -->
      <el-form v-else @keyup.enter="handleRegister">
        <el-form-item>
          <el-input v-model="phoneForm.phone" placeholder="请输入手机号" size="large" maxlength="11">
            <template #prefix><span class="field-label">手机号</span></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <div class="sms-row">
            <el-input v-model="phoneForm.code" placeholder="请输入验证码" size="large" maxlength="6">
              <template #prefix><span class="field-label">验证码</span></template>
            </el-input>
            <el-button
              type="primary" plain size="large" class="sms-btn"
              :disabled="countdown > 0" @click="handleSendSms"
            >{{ countdown > 0 ? `${countdown}s 后重发` : "获取验证码" }}</el-button>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="registerLoading" @click="handleRegister" style="width: 100%">
            完成注册
          </el-button>
        </el-form-item>
        <div class="step-tip">
          验证通过即注册成功并自动登录 ·
          <a @click.prevent="backToStep1" href="#">返回修改账号</a>
        </div>
      </el-form>

      <!-- 协议（仅第一步显示） -->
      <label v-if="step === 1" class="agree-row">
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
  margin-bottom: 20px;
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

/* 步骤指示器 */
.steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
}
.step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  color: var(--text-muted);
  transition: color 0.2s;
}
.step.active { color: var(--primary); font-weight: 600; }
.step-num {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  font-style: normal;
  background: var(--bg-soft, #f1f5f9);
  color: var(--text-muted);
  transition: all 0.2s;
}
.step.active .step-num {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 2px 8px var(--primary-glow);
}
.step-line {
  width: 48px;
  height: 2px;
  background: var(--border);
  border-radius: 1px;
  transition: background 0.3s;
}
.step-line.passed { background: var(--primary); }

.field-label {
  display: inline-block;
  width: 44px;
  font-size: 13.5px;
  color: var(--text);
  font-weight: 500;
}

.step-tip {
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.7;
  margin-top: -6px;
}
.step-tip a {
  color: var(--primary);
  font-weight: 600;
  cursor: pointer;
}

/* 短信行 */
.sms-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.sms-row .el-input { flex: 1; }
.sms-btn { flex-shrink: 0; width: 118px; }

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
