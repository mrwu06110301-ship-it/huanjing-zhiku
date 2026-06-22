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
      component: () => import("@/views/Home.vue"),
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
  // 有 token 但未加载用户信息时，自动拉取
  if (auth.token && !auth.user) {
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
