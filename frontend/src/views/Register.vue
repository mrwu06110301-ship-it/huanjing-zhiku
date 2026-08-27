<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { register, getMe } from "@/api/user";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";

const router = useRouter();
const auth = useAuthStore();

const form = ref({
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  nickname: "",
});
const loading = ref(false);

function handleRegister() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning("请输入用户名和密码");
    return;
  }
  if (form.value.password !== form.value.confirmPassword) {
    ElMessage.warning("两次密码不一致");
    return;
  }
  loading.value = true;
  register({
    username: form.value.username,
    email: form.value.email || undefined,
    password: form.value.password,
    nickname: form.value.nickname,
  })
    .then(async (res) => {
      auth.token = res.data.access_token;
      localStorage.setItem("hjzk_token", res.data.access_token);
      try {
        const meRes = await getMe();
        auth.setLogin(res.data.access_token, meRes.data);
      } catch {
        auth.setLogin(res.data.access_token, {} as any);
      }
      ElMessage.success("注册成功");
      router.push("/");
    })
    .catch((err) => {
      ElMessage.error(err?.response?.data?.detail || "注册失败");
    })
    .finally(() => {
      loading.value = false;
    });
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <div class="auth-logo">
          <Icon name="beaker" :size="44" :stroke="2" />
        </div>
        <h2>注册账号</h2>
        <p>加入产品小吴知识库社区</p>
      </div>
      <el-form :model="form" @keyup.enter="handleRegister">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.email" placeholder="邮箱（可选）" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.nickname" placeholder="昵称（可选）" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" show-password />
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
  padding: 48px 36px;
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
  margin-bottom: 32px;
}

.auth-logo {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  background: var(--gradient-primary);
  border-radius: 18px;
  color: #fff;
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

.auth-footer {
  text-align: center;
  margin-top: 20px;
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
  .auth-card { width: 100%; padding: 32px 24px; }
  .auth-logo { width: 60px; height: 60px; }
  .auth-header h2 { font-size: 20px; }
}
</style>
