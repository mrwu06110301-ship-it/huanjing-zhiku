<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getMe } from "@/api/user";
import Icon from "@/components/Icon.vue";

const router = useRouter();
const auth = useAuthStore();
const mobileMenuOpen = ref(false);
const searchQuery = ref("");
const searchExpanded = ref(false);
const searchInputRef = ref<HTMLInputElement>();
const scrolled = ref(false);

// 导航项
const navItems = [
  { path: "/", label: "首页", icon: "home" },
  { path: "/forum", label: "论坛", icon: "forum" },
  { path: "/videos", label: "视频", icon: "video" },
  { path: "/standards", label: "法规", icon: "standard" },
  { path: "/faq", label: "维保", icon: "faq" },
  { path: "/messages", label: "留言", icon: "message" },
  { path: "/tools", label: "工具", icon: "tool" },
  { path: "/about", label: "关于", icon: "about" },
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
  window.addEventListener("scroll", handleScroll);
});

function handleScroll() {
  scrolled.value = window.scrollY > 20;
}

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
  <header class="navbar" :class="{ scrolled }">
    <div class="navbar-inner">
      <!-- 品牌 -->
      <router-link to="/" class="navbar-brand">
        <div class="brand-logo">
          <Icon name="beaker" :size="20" :stroke="2" />
        </div>
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
          <Icon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- 搜索 -->
      <div class="navbar-search" :class="{ expanded: searchExpanded }">
        <template v-if="searchExpanded">
          <input
            v-model="searchQuery"
            placeholder="搜索文章、工具..."
            class="search-input"
            ref="searchInputRef"
            @keyup.enter="doSearch"
            @blur="handleBlur"
          />
          <button class="search-btn" @click="doSearch">
            <Icon name="search" :size="16" />
          </button>
        </template>
        <button v-else class="search-icon-btn" @click="expandSearch">
          <Icon name="search" :size="18" />
        </button>
      </div>

      <!-- 用户操作 -->
      <div class="navbar-actions">
        <template v-if="auth.isLoggedIn()">
          <el-dropdown>
            <span class="user-info">
              <div class="user-avatar">
                <Icon name="user" :size="16" />
              </div>
              <span class="user-name">{{ auth.user?.nickname || auth.user?.username || "用户" }}</span>
              <Icon name="arrowDown" :size="12" />
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/profile')">
                  <Icon name="user" :size="15" style="margin-right:6px" /> 个人中心
                </el-dropdown-item>
                <el-dropdown-item v-if="auth.isAdmin()" @click="router.push('/admin/categories')">
                  <Icon name="folder" :size="15" style="margin-right:6px" /> 分类管理
                </el-dropdown-item>
                <el-dropdown-item v-if="auth.isAdmin()" @click="router.push('/admin/carousel')">
                  <Icon name="carousel" :size="15" style="margin-right:6px" /> 轮播管理
                </el-dropdown-item>
                <el-dropdown-item v-if="auth.isAdmin()" @click="router.push('/admin/users')">
                  <Icon name="users" :size="15" style="margin-right:6px" /> 用户管理
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  <Icon name="logout" :size="15" style="margin-right:6px" /> 退出登录
                </el-dropdown-item>
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
        <Icon :name="mobileMenuOpen ? 'close' : 'menu'" :size="22" />
      </button>
    </div>

    <!-- 移动端导航 -->
    <transition name="slide-down">
      <nav v-if="mobileMenuOpen" class="mobile-nav">
        <div class="mobile-search">
          <Icon name="search" :size="16" class="mobile-search-icon" />
          <input v-model="searchQuery" placeholder="搜索..." class="mobile-search-input" @keyup.enter="doSearch" />
        </div>
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="mobile-nav-link"
          @click="mobileMenuOpen = false"
        >
          <Icon :name="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </router-link>

        <!-- 移动端登录/注册 -->
        <div class="mobile-auth">
          <template v-if="auth.isLoggedIn()">
            <span class="mobile-user">
              <Icon name="user" :size="16" />
              {{ auth.user?.nickname || auth.user?.username || "用户" }}
            </span>
            <button class="mobile-auth-btn logout" @click="handleLogout">退出</button>
          </template>
          <template v-else>
            <router-link to="/login" class="mobile-auth-btn" @click="mobileMenuOpen = false">登录</router-link>
            <router-link to="/register" class="mobile-auth-btn register" @click="mobileMenuOpen = false">注册</router-link>
          </template>
        </div>
      </nav>
    </transition>
  </header>
</template>

<style scoped>
.navbar {
  background: var(--dark-900);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 100;
  transition: all 0.3s var(--ease);
}

.navbar.scrolled {
  background: rgba(6, 10, 20, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.navbar::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.4), rgba(0, 230, 168, 0.2), transparent);
}

.navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  height: 60px;
  gap: 20px;
}

/* 品牌 */
.navbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #fff;
  white-space: nowrap;
  flex-shrink: 0;
}

.brand-logo {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  border-radius: 10px;
  box-shadow: 0 4px 12px var(--primary-glow);
  color: #fff;
  transition: transform 0.3s var(--ease);
}

.navbar-brand:hover .brand-logo {
  transform: scale(1.08) rotate(-5deg);
}

.brand-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #fff;
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
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s var(--ease);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.nav-link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.nav-link.active {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.1);
}

.nav-link.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #60a5fa;
  box-shadow: 0 0 8px #60a5fa;
}

/* 搜索 */
.navbar-search {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.navbar-search.expanded {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  padding: 0 4px 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s var(--ease);
}

.navbar-search.expanded:focus-within {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(96, 165, 250, 0.4);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.08);
}

.search-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  transition: all 0.2s;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
}

.search-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 13px;
  padding: 6px 4px;
  width: 140px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.search-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.search-btn:hover {
  color: #60a5fa;
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
  gap: 8px;
  font-size: 14px;
  padding: 4px 10px 4px 4px;
  border-radius: 20px;
  transition: background 0.2s;
}

.user-info:hover {
  background: rgba(255, 255, 255, 0.06);
}

.user-avatar {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(37, 99, 235, 0.2);
  border: 1px solid rgba(37, 99, 235, 0.4);
  border-radius: 50%;
  color: #60a5fa;
}

.btn {
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 13px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.25s var(--ease);
  display: inline-block;
}

.btn-outline {
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-outline:hover {
  border-color: rgba(96, 165, 250, 0.5);
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.05);
}

.btn-primary {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 2px 12px var(--primary-glow);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px var(--primary-glow);
}

/* 移动端 */
.mobile-menu-btn {
  display: none;
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  margin-left: auto;
  padding: 4px;
  display: flex;
  align-items: center;
}

.mobile-nav {
  padding: 8px 20px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--dark-900);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s var(--ease);
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.mobile-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  margin-bottom: 8px;
  padding: 0 12px;
}

.mobile-search-icon {
  color: rgba(255, 255, 255, 0.4);
}

.mobile-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  padding: 10px 0;
  font-size: 14px;
}

.mobile-search-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.mobile-nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  padding: 12px 8px;
  font-size: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: all 0.2s;
}

.mobile-nav-link:hover {
  color: #60a5fa;
  padding-left: 14px;
}

/* 移动端登录/注册 */
.mobile-auth {
  display: flex;
  gap: 8px;
  padding: 12px 0;
  align-items: center;
}

.mobile-user {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mobile-auth-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  text-decoration: none;
  font-weight: 600;
  text-align: center;
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.mobile-auth-btn.register {
  background: var(--gradient-primary);
  border-color: transparent;
  color: #fff;
}

.mobile-auth-btn.logout {
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

@media (max-width: 900px) {
  .navbar-nav,
  .navbar-actions,
  .navbar-search {
    display: none;
  }
  .mobile-menu-btn {
    display: flex;
  }
}
</style>
