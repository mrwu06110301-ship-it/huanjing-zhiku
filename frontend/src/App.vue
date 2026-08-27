<script setup lang="ts">
import Navbar from "@/components/Navbar.vue";
</script>

<template>
  <div class="app-wrapper">
    <Navbar />
    <main class="main-content">
      <router-view />
    </main>
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="footer-logo">产品小吴知识库</span>
          <span class="footer-divider"></span>
          <span class="footer-text">环境监测技术平台</span>
        </div>
        <nav class="footer-links">
          <router-link to="/forum">论坛</router-link>
          <router-link to="/videos">视频</router-link>
          <router-link to="/standards">法规</router-link>
          <router-link to="/tools">工具</router-link>
          <router-link to="/about">关于</router-link>
        </nav>
        <p class="footer-copy">© 2026 产品小吴知识库 · 让现场监测，触手可感</p>
      </div>
    </footer>
  </div>
</template>

<style>
:root {
  /* ===== Primary — 科技蓝（收敛单色系） ===== */
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --primary-light: #eff6ff;
  --primary-glow: rgba(37, 99, 235, 0.18);

  /* ===== Accent — 仅点缀 ===== */
  --accent: #06b6d4;
  --accent-light: #ecfeff;

  /* ===== Dark surfaces ===== */
  --dark-900: #090d16;
  --dark-800: #0d1320;
  --dark-700: #111a2c;

  /* ===== Text ===== */
  --text: #0f172a;
  --text-light: #475569;
  --text-muted: #94a3b8;

  /* ===== Surface ===== */
  --bg: #f8fafc;
  --bg-soft: #f1f5f9;
  --white: #ffffff;
  --border: #e2e8f0;
  --border-light: #eef2f7;

  /* ===== Shadows（更轻更柔） ===== */
  --shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 2px 8px rgba(15, 23, 42, 0.06);
  --shadow-lg: 0 8px 24px rgba(15, 23, 42, 0.1);
  --shadow-xl: 0 16px 40px rgba(15, 23, 42, 0.12);

  /* ===== Radius ===== */
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 16px;
  --radius-xl: 20px;

  /* ===== Gradients ===== */
  --gradient-primary: linear-gradient(135deg, #2563eb, #06b6d4);
  --gradient-dark: linear-gradient(165deg, #090d16 0%, #101a30 55%, #090d16 100%);

  /* ===== Transitions ===== */
  --ease: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 24px 20px;
}

a {
  color: var(--primary);
  text-decoration: none;
  transition: color 0.2s;
}
a:hover {
  color: var(--primary-dark);
}

/* ======== Footer ======== */
.site-footer {
  background: var(--dark-900);
  color: rgba(255, 255, 255, 0.65);
  margin-top: auto;
}

.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.footer-logo {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
}

.footer-divider {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.2);
}

.footer-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
}

.footer-links {
  display: flex;
  gap: 28px;
}

.footer-links a {
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  transition: color 0.2s;
}

.footer-links a:hover {
  color: #fff;
}

.footer-copy {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  width: 100%;
  text-align: center;
}

/* ======== Scrollbar ======== */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(37, 99, 235, 0.18);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(37, 99, 235, 0.35);
}

/* ======== Global Animations ======== */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* ======== Element Plus Overrides ======== */
.el-button--primary {
  --el-button-bg-color: var(--primary);
  --el-button-border-color: var(--primary);
  --el-button-hover-bg-color: var(--primary-dark);
  --el-button-hover-border-color: var(--primary-dark);
}

.el-pagination.is-background .el-pager li.is-active {
  background-color: var(--primary);
}

/* ======== Utility ======== */
.page-title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  background: var(--primary-light);
  color: var(--primary);
  margin-bottom: 12px;
}
</style>
