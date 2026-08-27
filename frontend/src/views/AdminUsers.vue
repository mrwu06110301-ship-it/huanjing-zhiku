<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getUserList } from "@/api/user";
import { setUploadPermission } from "@/api/video";
import type { UserOut } from "@/types";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";

const auth = useAuthStore();
const users = ref<UserOut[]>([]);
const loading = ref(false);

async function loadUsers() {
  loading.value = true;
  try { const res = await getUserList({ page: 1, page_size: 100 }); users.value = res.data || []; }
  catch { ElMessage.error("获取用户列表失败"); }
  finally { loading.value = false; }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  return dateStr.substring(0, 10);
}

onMounted(loadUsers);

async function toggleUpload(userId: number, canUpload: boolean) {
  try { await setUploadPermission(userId, canUpload); ElMessage.success(canUpload ? "已授权上传权限" : "已取消上传权限"); loadUsers(); }
  catch { ElMessage.error("操作失败"); }
}
</script>

<template>
  <div class="admin-users-page" v-if="auth.isAdmin()">
    <div class="page-header">
      <h1><Icon name="users" :size="26" /> 注册用户管理</h1>
      <p>查看所有注册用户信息</p>
    </div>

    <div class="users-table" v-loading="loading">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>昵称</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>上传权限 <el-tooltip content="开启后用户可在视频页面上传视频" placement="top"><Icon name="info" :size="14" style="cursor:help;opacity:0.4" /></el-tooltip></th>
            <th>注册时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.id }}</td>
            <td>{{ user.username }}</td>
            <td>{{ user.nickname || "-" }}</td>
            <td>{{ user.email || "-" }}</td>
            <td><span :class="['role-tag', user.role]">{{ user.role === 'admin' ? '管理员' : '用户' }}</span></td>
            <td>
              <el-switch v-if="user.role !== 'admin'" :model-value="!!(user as any).can_upload_video" size="small" @change="(val: boolean) => toggleUpload(user.id, val)" />
              <span v-else style="color:var(--text-light);font-size:12px">默认</span>
            </td>
            <td>{{ formatDate(user.created_at) }}</td>
          </tr>
        </tbody>
      </table>
      <el-empty v-if="!loading && users.length === 0" description="暂无注册用户" />
    </div>
  </div>
</template>

<style scoped>
.admin-users-page { max-width: 1100px; margin: 0 auto; padding: 24px 0; }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 26px; font-weight: 800; display: flex; align-items: center; gap: 10px; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.page-header p { color: var(--text-light); font-size: 14px; margin-top: 6px; }
.users-table {
  background: var(--card-bg); border-radius: var(--radius);
  box-shadow: var(--shadow); overflow-x: auto; border: 1px solid var(--card-border);
}
.users-table table { width: 100%; border-collapse: collapse; }
.users-table th {
  background: rgba(0,204,170,0.04); padding: 14px 16px; text-align: left;
  font-size: 13px; font-weight: 600; color: var(--text-light);
  border-bottom: 1px solid var(--card-border); white-space: nowrap;
}
.users-table td { padding: 14px 16px; border-bottom: 1px solid var(--card-border); font-size: 14px; color: var(--text); }
.role-tag { display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.role-tag.admin { background: rgba(245,158,11,0.12); color: #e67e22; }
.role-tag.user { background: rgba(0,204,170,0.1); color: var(--primary); }
</style>
