<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { updateMe, changePassword } from "@/api/user";
import { uploadImage } from "@/api/upload";
import { ElMessage } from "element-plus";

const router = useRouter();
const auth = useAuthStore();

const activeTab = ref("profile");

// 个人信息表单
const profileForm = ref({
  nickname: "",
  email: "",
  phone: "",
});
const avatarUrl = ref("");

// 密码表单
const passwordForm = ref({
  old_password: "",
  new_password: "",
  confirm_password: "",
});

onMounted(() => {
  if (!auth.token) {
    ElMessage.warning("请先登录");
    router.push("/login");
    return;
  }
  if (auth.user) {
    profileForm.value.nickname = auth.user.nickname || "";
    profileForm.value.email = auth.user.email || "";
    profileForm.value.phone = (auth.user as any).phone || "";
    avatarUrl.value = auth.user.avatar || "";
  }
});

// 头像上传
async function handleAvatarUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const res = await uploadImage(file);
    avatarUrl.value = res.data.url;
    await updateMe({ avatar: res.data.url });
    auth.user!.avatar = res.data.url;
    ElMessage.success("头像更新成功");
  } catch {
    ElMessage.error("头像上传失败");
  }
  input.value = "";
}

// 保存个人信息
async function handleSaveProfile() {
  try {
    const res = await updateMe({
      nickname: profileForm.value.nickname,
      email: profileForm.value.email || undefined,
      phone: profileForm.value.phone || undefined,
    });
    auth.user = res.data;
    ElMessage.success("个人信息更新成功");
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "更新失败");
  }
}

// 修改密码
async function handleChangePassword() {
  if (!passwordForm.value.old_password) {
    ElMessage.warning("请输入原密码");
    return;
  }
  if (passwordForm.value.new_password.length < 6) {
    ElMessage.warning("新密码至少6位");
    return;
  }
  if (passwordForm.value.new_password !== passwordForm.value.confirm_password) {
    ElMessage.warning("两次密码不一致");
    return;
  }
  try {
    await changePassword({
      old_password: passwordForm.value.old_password,
      new_password: passwordForm.value.new_password,
    });
    ElMessage.success("密码修改成功");
    passwordForm.value = { old_password: "", new_password: "", confirm_password: "" };
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "修改失败");
  }
}
</script>

<template>
  <div class="profile-page">
    <div class="page-header">
      <h1>👤 个人中心</h1>
    </div>

    <div class="profile-layout">
      <div class="profile-sidebar">
        <div class="avatar-section">
          <div class="avatar-wrapper">
            <img v-if="avatarUrl" :src="avatarUrl" alt="头像" class="avatar-img" />
            <div v-else class="avatar-placeholder">{{ (auth.user?.nickname || auth.user?.username || "U")[0] }}</div>
            <label class="avatar-upload-btn">
              <input type="file" accept="image/*" @change="handleAvatarUpload" hidden />
              📷
            </label>
          </div>
          <div class="user-name">{{ auth.user?.nickname || auth.user?.username }}</div>
          <div class="user-role">{{ auth.user?.role === 'admin' ? '管理员' : '普通用户' }}</div>
        </div>

        <div class="sidebar-menu">
          <div :class="['menu-item', { active: activeTab === 'profile' }]" @click="activeTab = 'profile'">
            📝 个人信息
          </div>
          <div :class="['menu-item', { active: activeTab === 'password' }]" @click="activeTab = 'password'">
            🔒 修改密码
          </div>
        </div>
      </div>

      <div class="profile-main">
        <!-- 个人信息 -->
        <div v-if="activeTab === 'profile'" class="profile-card">
          <h3>个人信息</h3>
          <el-form label-width="80px">
            <el-form-item label="用户名">
              <el-input :model-value="auth.user?.username" disabled />
            </el-form-item>
            <el-form-item label="昵称">
              <el-input v-model="profileForm.nickname" placeholder="请输入昵称" />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="profileForm.email" placeholder="请输入邮箱（可选）" />
            </el-form-item>
            <el-form-item label="手机号">
              <el-input v-model="profileForm.phone" placeholder="请输入手机号（可选）" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSaveProfile">保存</el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 修改密码 -->
        <div v-if="activeTab === 'password'" class="profile-card">
          <h3>修改密码</h3>
          <el-form label-width="80px">
            <el-form-item label="原密码">
              <el-input v-model="passwordForm.old_password" type="password" placeholder="请输入原密码" />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="passwordForm.new_password" type="password" placeholder="至少6位" />
            </el-form-item>
            <el-form-item label="确认密码">
              <el-input v-model="passwordForm.confirm_password" type="password" placeholder="再次输入新密码" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleChangePassword">修改密码</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 0;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 700;
}

.profile-layout {
  display: flex;
  gap: 24px;
}

.profile-sidebar {
  width: 220px;
  flex-shrink: 0;
}

.avatar-section {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 24px;
  text-align: center;
  margin-bottom: 16px;
}

.avatar-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 12px;
}

.avatar-img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), #00ccaa);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 600;
}

.avatar-upload-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  border: 2px solid #fff;
}

.user-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.user-role {
  font-size: 12px;
  color: var(--text-light);
}

.sidebar-menu {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.menu-item {
  padding: 14px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.menu-item:hover {
  background: #f8f9fa;
}

.menu-item.active {
  background: var(--primary-light);
  color: var(--primary);
  border-left-color: var(--primary);
  font-weight: 500;
}

.profile-main {
  flex: 1;
}

.profile-card {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 28px;
}

.profile-card h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

@media (max-width: 768px) {
  .profile-layout {
    flex-direction: column;
  }

  .profile-sidebar {
    width: 100%;
  }
}
</style>
