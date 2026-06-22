<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { login as loginApi, getMe } from "@/api/user";
import { ElMessage } from "element-plus";

const router = useRouter();
const auth = useAuthStore();

const form = ref({
  username: "",
  password: "",
});
const loading = ref(false);

async function handleLogin() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning("请输入用户名和密码");
    return;
  }
  loading.value = true;
  try {
    const res = await loginApi({
      username: form.value.username,
      password: form.value.password,
    });
    const token = res.data.access_token;
    auth.token = token;
    localStorage.setItem("hjzk_token", token);
    const meRes = await getMe();
    auth.setLogin(token, meRes.data);
    ElMessage.success("登录成功");
    router.push("/");
  } catch (err: unknown) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response;
    ElMessage.error(resp?.data?.detail ?? "登录失败");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <span class="auth-logo">🔬</span>
        <h2>产品小吴知识库</h2>
        <p>让现场监测，触手可感</p>
      </div>
      <el-form :model="form" @keyup.enter="handleLogin">
        <el-form-item>
          <el-input
            v-model="form.username"
            placeholder="用户名"
            size="large"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            @click="handleLogin"
            style="width: 100%"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <div class="auth-footer">
        <span>还没有账号？</span>
        <router-link to="/register">立即注册</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8edf5 100%);
}
.auth-card {
  width: 400px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.1);
  padding: 40px 32px;
}
.auth-header {
  text-align: center;
  margin-bottom: 32px;
}
.auth-logo {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
}
.auth-header h2 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}
.auth-header p {
  font-size: 13px;
  color: #7f8c8d;
}
.auth-footer {
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
  color: #7f8c8d;
}
.auth-footer a {
  color: #0066cc;
  margin-left: 4px;
}

@media (max-width: 768px) {
  .auth-page { padding: 20px 16px; }
  .auth-card { width: 100%; padding: 28px 20px; }
  .auth-logo { font-size: 40px; }
  .auth-header h2 { font-size: 20px; }
}
</style>
