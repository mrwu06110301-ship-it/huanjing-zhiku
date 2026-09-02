import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    // 不清空 outDir：本地沙箱删除防护会拦截批量删除导致构建中断；
    // 旧 chunk 在服务器端部署后按 index.html 引用白名单清理。
    emptyOutDir: false,
  },
});
