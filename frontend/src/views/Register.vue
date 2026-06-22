<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { register, getMe } from "@/api/user";
import { ElMessage } from "element-plus";

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
        <span class="auth-logo">🔬</span>
        <h2>注册账号</h2>
        <p>加入产品小吴知识库</p>
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
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8edf5 100%);
}
.auth-card {
  width: 400px;
  background: var(--white);
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
  color: var(--text-light);
}
.auth-footer {
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
  color: var(--text-light);
}
.auth-footer a {
  color: var(--primary);
  margin-left: 4px;
}

@media (max-width: 768px) {
  .auth-page { padding: 20px 16px; }
  .auth-card { width: 100%; padding: 28px 20px; }
  .auth-logo { font-size: 40px; }
  .auth-header h2 { font-size: 20px; }
}
</style>
