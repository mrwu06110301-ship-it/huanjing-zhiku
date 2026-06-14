<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getMe } from "@/api/user";

const router = useRouter();
const auth = useAuthStore();
const mobileMenuOpen = ref(false);
const searchQuery = ref("");
const searchExpanded = ref(false);
const searchInputRef = ref<HTMLInputElement>();

// 导航项（全部展开显示）
const navItems = [
  { path: "/", label: "首页" },
  { path: "/forum", label: "论坛" },
  { path: "/videos", label: "视频" },
  { path: "/standards", label: "法规" },
  { path: "/faq", label: "维保" },
  { path: "/messages", label: "留言" },
  { path: "/tools", label: "工具" },
  { path: "/about", label: "关于" },
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

function doSearch() {
  if (searchQuery.value.trim()) {
    router.push({ path: "/search", query: { q: searchQuery.value.trim() } });
    searchQuery.value = "";
    searchExpanded.value = false;
  }
}

function expandSearch() {
  searchExpanded.value = true;
  setTimeout(() => searchInputRef.value?.focus(), 100);
}

function handleBlur() {
  if (!searchQuery.value) searchExpanded.value = false;
}
</script>

<template>
  <header class="navbar">
    <div class="navbar-inner">
      <!-- 品牌 -->
      <router-link to="/" class="navbar-brand">
        <span class="brand-icon">🔬</span>
        <span class="brand-text">产品小吴知识库</span>
      </router-link>

      <!-- 导航 -->
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

      <!-- 搜索 -->
      <div class="navbar-search" :class="{ expanded: searchExpanded }">
        <template v-if="searchExpanded">
          <input
            v-model="searchQuery"
            placeholder="搜文章、工具..."
            class="search-input"
            ref="searchInputRef"
            @keyup.enter="doSearch"
            @blur="handleBlur"
          />
          <button class="search-btn" @click="doSearch">🔍</button>
        </template>
        <button v-else class="search-icon-btn" @click="expandSearch">🔍</button>
      </div>

      <!-- 用户操作 -->
      <div class="navbar-actions">
        <template v-if="auth.isLoggedIn()">
          <el-dropdown>
            <span class="user-info">
              {{ auth.user?.nickname || auth.user?.username || "用户" }}
              <el-icon><arrow-down /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/profile')">👤 个人中心</el-dropdown-item>
                <el-dropdown-item v-if="auth.isAdmin()" @click="router.push('/admin/categories')">📂 分类管理</el-dropdown-item>
                <el-dropdown-item v-if="auth.isAdmin()" @click="router.push('/admin/users')">👥 用户管理</el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
        <template v-else>
          <router-link to="/login" class="btn btn-outline">登录</router-link>
          <router-link to="/register" class="btn btn-primary">注册</router-link>
        </template>
      </div>

      <!-- 移动端菜单 -->
      <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
        {{ mobileMenuOpen ? "✕" : "☰" }}
      </button>
    </div>

    <!-- 移动端导航 -->
    <nav v-if="mobileMenuOpen" class="mobile-nav">
      <div class="mobile-search">
        <input v-model="searchQuery" placeholder="搜索..." class="mobile-search-input" @keyup.enter="doSearch" />
        <button class="mobile-search-btn" @click="doSearch">🔍</button>
      </div>
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="mobile-nav-link"
        @click="mobileMenuOpen = false"
      >
        {{ item.label }}
      </router-link>
    </nav>
  </header>
</template>

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
  height: 60px;
  gap: 24px;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: #fff;
  white-space: nowrap;
  flex-shrink: 0;
}

.brand-icon {
  font-size: 24px;
}

.brand-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  background: linear-gradient(90deg, #00ccaa, #3399ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* 导航 */
.navbar-nav {
  display: flex;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.nav-link {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  cursor: pointer;
}

.nav-link:hover,
.nav-link.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.nav-link.active {
  background: rgba(0, 204, 170, 0.2);
}

/* 搜索 */
.navbar-search {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.navbar-search.expanded {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 0 4px 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.2s;
}

.navbar-search.expanded:focus-within {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(0, 204, 170, 0.5);
}

.search-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 6px;
  border-radius: 50%;
  transition: all 0.2s;
}

.search-icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 13px;
  padding: 6px 4px;
  width: 130px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.search-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  color: rgba(255, 255, 255, 0.6);
}

/* 用户 */
.navbar-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}

.user-info {
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  padding: 6px 10px;
  border-radius: 6px;
  transition: background 0.2s;
}

.user-info:hover {
  background: rgba(255, 255, 255, 0.08);
}

.btn {
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 13px;
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
  background: linear-gradient(135deg, #00ccaa, #00b894);
  color: #fff;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #00ddbb, #00ccaa);
}

/* 移动端 */
.mobile-menu-btn {
  display: none;
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  margin-left: auto;
}

.mobile-nav {
  padding: 8px 20px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.mobile-search {
  display: flex;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
}

.mobile-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  padding: 10px 12px;
  font-size: 14px;
}

.mobile-search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.mobile-search-btn {
  background: none;
  border: none;
  color: #fff;
  padding: 0 12px;
  cursor: pointer;
  font-size: 16px;
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
  .navbar-actions,
  .navbar-search {
    display: none;
  }
  .mobile-menu-btn {
    display: block;
  }
}
</style>
