/** 路由配置 */

import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getMe } from "@/api/user";
import { ElMessage } from "element-plus";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "Home",
      component: () => import("@/views/HomePage.vue"),
    },
    {
      path: "/forum",
      name: "Forum",
      component: () => import("@/views/Forum.vue"),
    },
    {
      path: "/article/:id",
      name: "ArticleDetail",
      component: () => import("@/views/ArticleDetail.vue"),
    },
    {
      path: "/article/edit/:id?",
      name: "ArticleEdit",
      component: () => import("@/views/ArticleEdit.vue"),
    },
    {
      path: "/videos",
      name: "Videos",
      component: () => import("@/views/Videos.vue"),
    },
    {
      path: "/videos/:id",
      name: "VideoDetail",
      component: () => import("@/views/VideoDetail.vue"),
    },
    {
      path: "/video/upload",
      name: "VideoUpload",
      component: () => import("@/views/VideoUpload.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/standards",
      name: "Standards",
      component: () => import("@/views/Standards.vue"),
    },
    {
      path: "/standard-preview",
      name: "StandardPreview",
      component: () => import("@/views/StandardPreview.vue"),
    },
    {
      path: "/faq",
      name: "FAQ",
      component: () => import("@/views/FAQ.vue"),
    },
    {
      path: "/tools",
      name: "Tools",
      component: () => import("@/views/Tools.vue"),
    },
    {
      path: "/tools/:slug",
      name: "ToolDetail",
      component: () => import("@/views/ToolDetail.vue"),
    },
    {
      path: "/login",
      name: "Login",
      component: () => import("@/views/Login.vue"),
    },
    {
      path: "/register",
      name: "Register",
      component: () => import("@/views/Register.vue"),
    },
    {
      path: "/wechat/callback",
      name: "WechatCallback",
      component: () => import("@/views/WechatCallback.vue"),
    },
    {
      path: "/terms",
      name: "Terms",
      component: () => import("@/views/TermsPage.vue"),
    },
    {
      path: "/privacy",
      name: "Privacy",
      component: () => import("@/views/PrivacyPage.vue"),
    },
    {
      path: "/admin/categories",
      name: "CategoryManage",
      component: () => import("@/views/CategoryManage.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/profile",
      name: "Profile",
      component: () => import("@/views/Profile.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/admin/users",
      name: "AdminUsers",
      component: () => import("@/views/AdminUsers.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/admin/carousel",
      name: "AdminCarousel",
      component: () => import("@/views/AdminCarousel.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/admin/kb",
      name: "AdminKB",
      component: () => import("@/views/AdminKB.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/admin/tools",
      name: "AdminTools",
      component: () => import("@/views/AdminTools.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/about",
      name: "About",
      component: () => import("@/views/About.vue"),
    },
    {
      path: "/messages",
      name: "Messages",
      component: () => import("@/views/Messages.vue"),
    },
    {
      path: "/game",
      name: "Game",
      component: () => import("@/views/Game.vue"),
      meta: { requiresAdmin: true }, // 内测期仅管理员，正式上线后移除
    },
    {
      path: "/search",
      name: "Search",
      component: () => import("@/views/Search.vue"),
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

// 导航守卫
router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();
  // 有 token 就拉取最新用户信息（进管理员页时刷新 role，避免改权限后前端缓存滞后）
  if (auth.token) {
    try {
      const res = await getMe();
      auth.setLogin(auth.token, res.data);
    } catch { /* token 无效 */ }
  }
  if (to.meta.requiresAuth && !auth.isLoggedIn()) {
    ElMessage.warning("请先登录");
    next("/login");
  } else if (to.meta.requiresAdmin && !auth.isAdmin()) {
    ElMessage.warning("需要管理员权限");
    next("/");
  } else {
    next();
  }
});

export default router;
