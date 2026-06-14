<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { getArticles } from "@/api/article";
import { getVideos } from "@/api/video";
import { getStandards } from "@/api/standard";
import { getTools } from "@/api/tool";
import type { ArticleListOut, VideoOut, StandardOut, ToolOut } from "@/types";

const router = useRouter();
const latestArticles = ref<ArticleListOut[]>([]);
const videos = ref<VideoOut[]>([]);
const standards = ref<StandardOut[]>([]);
const tools = ref<ToolOut[]>([]);
const loading = ref(true);

// 动画统计数值
const animatedStats = ref([0, 0, 0, 0]);
const targetStats = ref([0, 0, 0, 0]);

onMounted(async () => {
  try {
    const [artRes, vidRes, stdRes, toolRes] = await Promise.all([
      getArticles({ page: 1, page_size: 6 }),
      getVideos({ page: 1, page_size: 1 }),
      getStandards({ page: 1, page_size: 1 }),
      getTools(),
    ]);
    latestArticles.value = artRes.data.items || [];
    videos.value = vidRes.data?.items || [];
    standards.value = stdRes.data?.items || [];
    tools.value = toolRes.data || [];

    // 设置目标数值（使用分页总数）
    targetStats.value = [
      artRes.data.total || 0,
      vidRes.data?.total || 0,
      stdRes.data?.total || 0,
      tools.value.length,
    ];

    // 触发数字动画
    animateNumbers();
  } catch {
    // 静默处理
  } finally {
    loading.value = false;
  }
});

// 数字滚动动画
function animateNumbers() {
  const duration = 1500;
  const steps = 60;
  const stepTime = duration / steps;
  let current = 0;

  const timer = setInterval(() => {
    current++;
    const progress = current / steps;
    const easeOut = 1 - Math.pow(1 - progress, 3);
    
    for (let i = 0; i < 4; i++) {
      animatedStats.value[i] = Math.floor(targetStats.value[i] * easeOut);
    }

    if (current >= steps) {
      clearInterval(timer);
      animatedStats.value = [...targetStats.value];
    }
  }, stepTime);
}

const stats = computed(() => [
  { label: "技术文章", value: animatedStats.value[0], icon: "📄", suffix: "篇" },
  { label: "学习视频", value: animatedStats.value[1], icon: "🎥", suffix: "个" },
  { label: "方法标准", value: animatedStats.value[2], icon: "📊", suffix: "项" },
  { label: "在线工具", value: animatedStats.value[3], icon: "🧮", suffix: "个" },
]);

const modules = [
  {
    title: "技术论坛",
    desc: "数智化畅享、案例分享、技术探讨",
    icon: "💬",
    path: "/forum",
    color: "#0066cc",
    gradient: "linear-gradient(135deg, #0066cc, #0099ff)",
  },
  {
    title: "学习视频",
    desc: "知识科普、实操演示、技术探讨",
    icon: "🎬",
    path: "/videos",
    color: "#00ccaa",
    gradient: "linear-gradient(135deg, #00ccaa, #00e6bb)",
  },
  {
    title: "方法标准",
    desc: "标准文档、标准解读、选型手册",
    icon: "📋",
    path: "/standards",
    color: "#ff9900",
    gradient: "linear-gradient(135deg, #ff9900, #ffbb33)",
  },
  {
    title: "常见问题",
    desc: "现场问题、设备维护、用户答疑",
    icon: "❓",
    path: "/faq",
    color: "#e74c3c",
    gradient: "linear-gradient(135deg, #e74c3c, #ff6b6b)",
  },
  {
    title: "常用工具",
    desc: "采样模型、单位换算、布点计算",
    icon: "🧮",
    path: "/tools",
    color: "#9b59b6",
    gradient: "linear-gradient(135deg, #9b59b6, #bb7dd4)",
  },
];
</script>

<template>
  <div class="home">
    <!-- Hero 区域 -->
    <section class="hero">
      <div class="hero-bg"></div>
      <div class="hero-particles">
        <div class="particle" v-for="i in 20" :key="i" :style="{ '--delay': i * 0.5 + 's', '--x': (i * 7) % 100 + '%' }"></div>
      </div>
      <div class="hero-content">
        <div class="hero-badge">🔬 环境监测技术平台</div>
        <h1 class="hero-title">产品小吴知识库</h1>
        <p class="hero-slogan">让现场监测，触手可感</p>
        <p class="hero-desc">
          聚焦环境监测领域，提供技术交流、学习视频、方法标准、现场问题解决方案与专业计算工具
        </p>
        <div class="hero-actions">
          <router-link to="/forum" class="hero-btn primary">进入论坛</router-link>
          <router-link to="/tools" class="hero-btn outline">使用工具</router-link>
        </div>
      </div>
      <div class="hero-visual">
        <div class="orbit orbit-1"></div>
        <div class="orbit orbit-2"></div>
        <div class="orbit orbit-3"></div>
        <div class="center-glow"></div>
      </div>
    </section>

    <!-- 数据统计 -->
    <section class="stats-bar">
      <div class="stat-item" v-for="s in stats" :key="s.label">
        <span class="stat-icon">{{ s.icon }}</span>
        <span class="stat-value">{{ s.value }}<small>{{ s.suffix }}</small></span>
        <span class="stat-label">{{ s.label }}</span>
      </div>
    </section>

    <!-- 功能模块 -->
    <section class="modules-section">
      <h2 class="section-title">功能模块</h2>
      <div class="modules-grid">
        <div
          v-for="m in modules"
          :key="m.title"
          class="module-card"
          @click="router.push(m.path)"
        >
          <div class="module-icon" :style="{ background: m.gradient }">
            {{ m.icon }}
          </div>
          <h3>{{ m.title }}</h3>
          <p>{{ m.desc }}</p>
          <span class="module-arrow">→</span>
        </div>
      </div>
    </section>

    <!-- 最新文章 -->
    <section class="articles-section" v-if="latestArticles.length">
      <h2 class="section-title">最新文章</h2>
      <div class="articles-grid">
        <div
          v-for="article in latestArticles"
          :key="article.id"
          class="article-card"
          @click="router.push(`/article/${article.id}`)"
        >
          <div class="article-meta">
            <span class="article-category">{{ article.category_name || '论坛' }}</span>
            <span class="article-date">{{ article.created_at?.substring(0, 10) }}</span>
          </div>
          <h3>{{ article.title }}</h3>
          <p>{{ article.summary }}</p>
          <div class="article-footer">
            <span>{{ article.author_name }}</span>
            <span>👁 {{ article.view_count }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 常用工具 -->
    <section class="tools-section" v-if="tools.length">
      <h2 class="section-title">常用工具</h2>
      <div class="tools-grid">
        <div
          v-for="tool in tools"
          :key="tool.id"
          class="tool-card"
          @click="router.push(`/tools/${tool.slug}`)"
        >
          <span class="tool-icon">{{ tool.icon }}</span>
          <h4>{{ tool.name }}</h4>
          <p>{{ tool.description }}</p>
          <span class="tool-badge">{{ tool.category }}</span>
        </div>
      </div>
    </section>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<style scoped>
/* Hero */
.home {
  margin: -24px -20px 0;
  position: relative;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #0066cc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.hero {
  position: relative;
  background: linear-gradient(135deg, #0a1628 0%, #0d2847 40%, #0a3366 100%);
  color: #fff;
  padding: 80px 40px 100px;
  overflow: hidden;
  min-height: 480px;
  display: flex;
  align-items: center;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 50%, rgba(0, 204, 170, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(0, 102, 204, 0.1) 0%, transparent 50%);
}

.hero-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: rgba(0, 204, 170, 0.4);
  border-radius: 50%;
  top: -10px;
  left: var(--x);
  animation: fall 8s linear infinite;
  animation-delay: var(--delay);
}

@keyframes fall {
  0% { transform: translateY(-10px); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(100vh); opacity: 0; }
}

.hero-content {
  position: relative;
  z-index: 2;
  max-width: 600px;
  animation: fadeInUp 0.8s ease-out;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-badge {
  display: inline-block;
  padding: 6px 16px;
  background: rgba(0, 204, 170, 0.15);
  border: 1px solid rgba(0, 204, 170, 0.3);
  border-radius: 20px;
  font-size: 13px;
  color: #00ccaa;
  margin-bottom: 20px;
  animation: fadeIn 0.6s ease-out 0.2s both;
}

.hero-title {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: 6px;
  margin-bottom: 12px;
  background: linear-gradient(90deg, #00ccaa, #3399ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: fadeIn 0.6s ease-out 0.4s both;
}

.hero-slogan {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 16px;
  font-weight: 300;
  letter-spacing: 4px;
  animation: fadeIn 0.6s ease-out 0.6s both;
}

.hero-desc {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.7;
  margin-bottom: 32px;
  animation: fadeIn 0.6s ease-out 0.8s both;
}

.hero-actions {
  display: flex;
  gap: 16px;
  animation: fadeIn 0.6s ease-out 1s both;
}

.hero-btn {
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.3s;
}

.hero-btn.primary {
  background: linear-gradient(135deg, #00ccaa, #0099cc);
  color: #fff;
}

.hero-btn.primary:hover {
  box-shadow: 0 4px 20px rgba(0, 204, 170, 0.4);
  transform: translateY(-2px);
}

.hero-btn.outline {
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

.hero-btn.outline:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

/* 动态轨道 */
.hero-visual {
  position: absolute;
  right: 10%;
  top: 50%;
  transform: translateY(-50%);
  width: 300px;
  height: 300px;
}

.orbit {
  position: absolute;
  border: 1px solid rgba(0, 204, 170, 0.15);
  border-radius: 50%;
  animation: spin 20s linear infinite;
}

.orbit-1 {
  width: 300px;
  height: 300px;
  top: 0;
  left: 0;
}

.orbit-2 {
  width: 220px;
  height: 220px;
  top: 40px;
  left: 40px;
  animation-duration: 15s;
  animation-direction: reverse;
  border-color: rgba(0, 102, 204, 0.15);
}

.orbit-3 {
  width: 140px;
  height: 140px;
  top: 80px;
  left: 80px;
  animation-duration: 10s;
}

.center-glow {
  position: absolute;
  width: 60px;
  height: 60px;
  top: 120px;
  left: 120px;
  background: radial-gradient(circle, rgba(0, 204, 170, 0.3), transparent 70%);
  border-radius: 50%;
  animation: pulse 3s ease-in-out infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.2); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 统计条 */
.stats-bar {
  display: flex;
  justify-content: center;
  gap: 48px;
  padding: 40px 20px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 10;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: transform 0.3s;
}

.stat-item:hover {
  transform: translateY(-4px);
}

.stat-icon {
  font-size: 28px;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--primary);
  font-family: monospace;
}

.stat-value small {
  font-size: 14px;
  font-weight: 400;
  margin-left: 2px;
  color: var(--text-light);
}

.stat-label {
  font-size: 13px;
  color: var(--text-light);
}

/* 模块卡片 */
.modules-section,
.articles-section,
.tools-section {
  padding: 48px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.section-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 24px;
  padding-left: 12px;
  border-left: 4px solid var(--primary);
}

.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.module-card {
  background: #fff;
  border-radius: var(--radius);
  padding: 24px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: var(--shadow);
  position: relative;
  overflow: hidden;
}

.module-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}

.module-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: 16px;
  transition: transform 0.3s;
}

.module-card:hover .module-icon {
  transform: scale(1.1);
}

.module-card h3 {
  font-size: 16px;
  margin-bottom: 6px;
}

.module-card p {
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.5;
}

.module-arrow {
  position: absolute;
  right: 16px;
  bottom: 16px;
  color: var(--text-light);
  font-size: 18px;
  transition: all 0.3s;
}

.module-card:hover .module-arrow {
  transform: translateX(6px);
  color: var(--primary);
}

/* 文章卡片 */
.articles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

.article-card {
  background: #fff;
  border-radius: var(--radius);
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: var(--shadow);
}

.article-card:hover {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
  transform: translateY(-4px);
}

.article-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-light);
}

.article-category {
  color: var(--primary);
  font-weight: 500;
}

.article-card h3 {
  font-size: 16px;
  margin-bottom: 8px;
  line-height: 1.4;
}

.article-card p {
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-light);
}

/* 工具卡片 */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.tool-card {
  background: #fff;
  border-radius: var(--radius);
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: var(--shadow);
}

.tool-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.tool-icon {
  font-size: 36px;
  display: block;
  margin-bottom: 12px;
  transition: transform 0.3s;
}

.tool-card:hover .tool-icon {
  transform: scale(1.2);
}

.tool-card h4 {
  font-size: 14px;
  margin-bottom: 4px;
}

.tool-card p {
  font-size: 12px;
  color: var(--text-light);
}

.tool-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 8px;
  background: var(--primary-light);
  color: var(--primary);
  border-radius: 4px;
  font-size: 11px;
}

@media (max-width: 768px) {
  .hero {
    padding: 48px 20px 64px;
    min-height: auto;
  }
  .hero-title {
    font-size: 32px;
  }
  .hero-visual {
    display: none;
  }
  .stats-bar {
    gap: 24px;
    flex-wrap: wrap;
  }
  .hero-slogan {
    font-size: 18px;
  }
  .stat-value {
    font-size: 24px;
  }
}
</style>
