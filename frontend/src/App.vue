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
        <p>产品小吴知识库 &copy; 2026 — 让现场监测，触手可感</p>
      </div>
    </footer>
  </div>
</template>

<style>
:root {
  --primary: #0066cc;
  --primary-dark: #004c99;
  --primary-light: #e6f0ff;
  --accent: #00ccaa;
  --accent-light: #e6fff9;
  --text: #2c3e50;
  --text-light: #7f8c8d;
  --bg: #f5f7fa;
  --white: #ffffff;
  --border: #e4e7ed;
  --shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  --radius: 8px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--text);
  background: var(--bg);
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

.site-footer {
  background: var(--primary-dark);
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  padding: 20px;
  margin-top: auto;
}

a {
  color: var(--primary);
  text-decoration: none;
}
a:hover {
  color: var(--primary-dark);
}
</style>
