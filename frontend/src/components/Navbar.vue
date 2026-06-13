<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getMe } from "@/api/user";

const router = useRouter();
const auth = useAuthStore();
const mobileMenuOpen = ref(false);

const navItems = [
  { path: "/", label: "首页", icon: "🏠" },
  { path: "/forum", label: "技术论坛", icon: "💬" },
  { path: "/videos", label: "学习视频", icon: "🎬" },
  { path: "/standards", label: "方法标准", icon: "📋" },
  { path: "/faq", label: "常见问题", icon: "❓" },
  { path: "/tools", label: "常用工具", icon: "🧮" },
];

onMounted(async () => {
  if (auth.token && !auth.user) {
    try {
      const res = await getMe();
      auth.user = res.data;
    } catch {
      auth.logout();
    }
  }
});

function handleLogout() {
  auth.logout();
  router.push("/");
}
</script>

<template>
  <header class="navbar">
    <div class="navbar-inner">
      <router-link to="/" class="navbar-brand">
        <span class="brand-icon">🔬</span>
        <span class="brand-text">环监智库</span>
        <span class="brand-slogan">让现场监测，触手可感</span>
      </router-link>

      <!-- 桌面导航 -->
      <nav class="navbar-nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-link"
          active-class="active"
        >
          {{ item.label }}
        </router-link>
      </nav>

      <div class="navbar-actions">
        <template v-if="auth.isLoggedIn()">
          <el-dropdown>
            <span class="user-info">
              {{ auth.user?.nickname || auth.user?.username || "用户" }}
              <el-icon><arrow-down /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="auth.isAdmin()" @click="router.push('/admin/categories')">
                  📂 分类管理
                </el-dropdown-item>
                <el-dropdown-item @click="handleLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
        <template v-else>
          <router-link to="/login" class="btn btn-outline">登录</router-link>
          <router-link to="/register" class="btn btn-primary">注册</router-link>
        </template>
      </div>

      <!-- 移动端菜单按钮 -->
      <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
        {{ mobileMenuOpen ? "✕" : "☰" }}
      </button>
    </div>

    <!-- 移动端菜单 -->
    <nav v-if="mobileMenuOpen" class="mobile-nav">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="mobile-nav-link"
        @click="mobileMenuOpen = false"
      >
        {{ item.icon }} {{ item.label }}
      </router-link>
    </nav>
  </header>
</template>

<script lang="ts">
import { ArrowDown } from "@element-plus/icons-vue";
export default { components: { ArrowDown } };
</script>

<style scoped>
.navbar {
  background: linear-gradient(135deg, #0a1628 0%, #0d2847 50%, #0a1628 100%);
  color: #fff;
  box-shadow: 0 2px 20px rgba(0, 102, 204, 0.15);
  position: sticky;
  top: 0;
  z-index: 100;
}

.navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  height: 64px;
  gap: 32px;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: #fff;
  white-space: nowrap;
}

.brand-icon {
  font-size: 28px;
}

.brand-text {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #00ccaa, #3399ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-slogan {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  padding-left: 8px;
}

.navbar-nav {
  display: flex;
  gap: 4px;
  flex: 1;
}

.nav-link {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.nav-link:hover,
.nav-link.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.nav-link.active {
  background: rgba(0, 204, 170, 0.2);
}

.navbar-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.user-info {
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 14px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-outline {
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.btn-outline:hover {
  border-color: #fff;
  color: #fff;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
}

.btn-primary:hover {
  background: #00b894;
}

.mobile-menu-btn {
  display: none;
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
}

.mobile-nav {
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.mobile-nav-link {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  padding: 10px 0;
  font-size: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

@media (max-width: 900px) {
  .navbar-nav,
  .navbar-actions {
    display: none;
  }
  .mobile-menu-btn {
    display: block;
    margin-left: auto;
  }
  .brand-slogan {
    display: none;
  }
}
</style>
