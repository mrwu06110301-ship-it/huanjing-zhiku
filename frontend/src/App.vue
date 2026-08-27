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
          <span class="footer-logo">HJZK</span>
          <span class="footer-text">环境监测技术平台</span>
        </div>
        <div class="footer-links">
          <router-link to="/forum">论坛</router-link>
          <router-link to="/videos">视频</router-link>
          <router-link to="/standards">法规</router-link>
          <router-link to="/tools">工具</router-link>
          <router-link to="/about">关于</router-link>
        </div>
        <p class="footer-copy">产品小吴知识库 &copy; 2026 — 让现场监测，触手可感</p>
      </div>
    </footer>
  </div>
</template>

<style>
:root {
  /* Primary — Electric Cyan */
  --primary: #00b8d9;
  --primary-dark: #0099b8;
  --primary-light: #e0f7fa;
  --primary-glow: rgba(0, 184, 217, 0.25);

  /* Accent — Emerald */
  --accent: #00e6a8;
  --accent-dark: #00c997;
  --accent-light: #e0faf2;
  --accent-glow: rgba(0, 230, 168, 0.2);

  /* Secondary — Indigo */
  --secondary: #5b7cfa;
  --secondary-glow: rgba(91, 124, 250, 0.2);

  /* Dark surfaces */
  --dark-900: #060a14;
  --dark-800: #0a0f1e;
  --dark-700: #0f1629;
  --dark-600: #141d35;
  --dark-500: #1a253f;

  /* Text */
  --text: #1a2535;
  --text-light: #64748b;
  --text-muted: #94a3b8;

  /* Surface */
  --bg: #f0f4f8;
  --bg-soft: #f7f9fc;
  --white: #ffffff;
  --border: #e2e8f0;
  --border-light: #f1f5f9;

  /* Shadows */
  --shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);
  --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.12);
  --shadow-xl: 0 24px 48px rgba(15, 23, 42, 0.16);

  /* Radius */
  --radius: 10px;
  --radius-sm: 6px;
  --radius-lg: 16px;
  --radius-xl: 20px;

  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #00b8d9, #00e6a8);
  --gradient-dark: linear-gradient(160deg, #060a14 0%, #0a1525 50%, #060a14 100%);
  --gradient-tech: linear-gradient(135deg, #00b8d9 0%, #5b7cfa 100%);

  /* Transitions */
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
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "cv11", "ss01";
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

/* ======== Footer ======== */
.site-footer {
  background: var(--dark-900);
  color: rgba(255, 255, 255, 0.6);
  margin-top: auto;
  position: relative;
  overflow: hidden;
}

.site-footer::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--primary), var(--accent), transparent);
  opacity: 0.5;
}

.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 20px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.footer-logo {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 3px;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.footer-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
}

.footer-links {
  display: flex;
  gap: 24px;
}

.footer-links a {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  text-decoration: none;
  transition: color 0.2s;
}

.footer-links a:hover {
  color: var(--accent);
}

.footer-copy {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  width: 100%;
  text-align: center;
}

a {
  color: var(--primary);
  text-decoration: none;
  transition: color 0.2s;
}
a:hover {
  color: var(--primary-dark);
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
  background: rgba(0, 184, 217, 0.2);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 184, 217, 0.4);
}

/* ======== Global Animations ======== */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
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

/* ======== Utility Classes ======== */
.page-title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--gradient-primary);
  color: #fff;
  margin-bottom: 12px;
  box-shadow: 0 4px 16px var(--primary-glow);
}
</style>
