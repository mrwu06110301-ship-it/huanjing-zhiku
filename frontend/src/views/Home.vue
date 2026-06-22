<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { getArticles } from "@/api/article";
import { getVideos } from "@/api/video";
import { getStandards } from "@/api/standard";
import { getTools } from "@/api/tool";
import { getMessages } from "@/api/message";
import { getFAQs } from "@/api/faq";
import type { ArticleListOut, VideoOut, StandardOut, ToolOut } from "@/types";

const router = useRouter();
const latestArticles = ref<ArticleListOut[]>([]);
const videos = ref<VideoOut[]>([]);
const standards = ref<StandardOut[]>([]);
const tools = ref<ToolOut[]>([]);
const loading = ref(true);

// 动画统计数值 — 扩展为 6 项
const animatedStats = ref([0, 0, 0, 0, 0, 0]);
const targetStats = ref([0, 0, 0, 0, 0, 0]);

onMounted(async () => {
  try {
    const [artRes, vidRes, stdRes, toolRes, msgRes, faqRes] = await Promise.all([
      getArticles({ page: 1, page_size: 6 }),
      getVideos({ page: 1, page_size: 1 }),
      getStandards({ page: 1, page_size: 1 }),
      getTools(),
      getMessages({ page: 1, page_size: 1 }).catch(() => ({ data: [] })),
      getFAQs({ page: 1, page_size: 1 }).catch(() => ({ data: { total: 0 } })),
    ]);
    latestArticles.value = artRes.data.items || [];
    videos.value = vidRes.data?.items || [];
    standards.value = stdRes.data?.items || [];
    tools.value = toolRes.data || [];

    targetStats.value = [
      artRes.data.total || 0,
      vidRes.data?.total || 0,
      stdRes.data?.total || 0,
      tools.value.length,
      faqRes.data?.total || 0,
      (msgRes.data as any)?.length || 0,
    ];

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

    for (let i = 0; i < 6; i++) {
      animatedStats.value[i] = Math.floor(targetStats.value[i] * easeOut);
    }

    if (current >= steps) {
      clearInterval(timer);
      animatedStats.value = [...targetStats.value];
    }
  }, stepTime);
}

const stats = computed(() => [
  { label: "技术干货", value: animatedStats.value[0], icon: "📄", suffix: "篇", desc: "深度技术文章与案例分享" },
  { label: "精品课程", value: animatedStats.value[1], icon: "🎬", suffix: "节", desc: "现场实操与技术讲解" },
  { label: "标准规范", value: animatedStats.value[2], icon: "📊", suffix: "项", desc: "权威方法标准与解读" },
  { label: "专业工具", value: animatedStats.value[3], icon: "⚡", suffix: "个", desc: "采样计算与数据转换" },
  { label: "维保方案", value: animatedStats.value[4], icon: "🛠️", suffix: "条", desc: "设备维护与现场问题" },
  { label: "用户反馈", value: animatedStats.value[5], icon: "💡", suffix: "条", desc: "留言互动与答疑解惑" },
]);

const modules = [
  {
    title: "技术论坛",
    desc: "数智化畅享、案例分享、技术探讨",
    icon: "💬",
    path: "/forum",
    gradient: "linear-gradient(135deg, #0044cc, #0066ff, #3399ff)",
  },
  {
    title: "学习视频",
    desc: "知识科普、实操演示、技术探讨",
    icon: "🎬",
    path: "/videos",
    gradient: "linear-gradient(135deg, #009977, #00ccaa, #00eebb)",
  },
  {
    title: "方法标准",
    desc: "标准文档、标准解读、选型手册",
    icon: "📋",
    path: "/standards",
    gradient: "linear-gradient(135deg, #cc7700, #ff9900, #ffbb33)",
  },
  {
    title: "常见问题",
    desc: "现场问题、设备维护、用户答疑",
    icon: "❓",
    path: "/faq",
    gradient: "linear-gradient(135deg, #cc2233, #e74c3c, #ff6b6b)",
  },
  {
    title: "常用工具",
    desc: "采样模型、单位换算、布点计算",
    icon: "🧮",
    path: "/tools",
    gradient: "linear-gradient(135deg, #7733aa, #9b59b6, #bb7dd4)",
  },
];
</script>

<template>
  <div class="home">
    <!-- Hero 区域 -->
    <section class="hero">
      <div class="hero-grid-bg"></div>
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

      <!-- 统计卡片 — 嵌入 Hero 右侧 -->
      <div class="hero-stats">
        <div class="stats-glass">
          <div class="stat-row" v-for="(s, i) in stats" :key="s.label" :style="{ '--i': i }">
            <div class="stat-icon-wrap">
              <span class="stat-icon">{{ s.icon }}</span>
            </div>
            <div class="stat-body">
              <span class="stat-value">{{ s.value }}<small>{{ s.suffix }}</small></span>
              <span class="stat-label">{{ s.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="hero-visual">
        <div class="orbit orbit-1"><div class="orbit-dot"></div></div>
        <div class="orbit orbit-2"><div class="orbit-dot"></div></div>
        <div class="orbit orbit-3"><div class="orbit-dot"></div></div>
        <div class="center-glow"></div>
      </div>
    </section>

    <!-- 功能模块 — 圆角大图标横幅 -->
    <section class="modules-section">
      <h2 class="section-title">探索功能</h2>
      <div class="modules-grid">
        <div
          v-for="m in modules"
          :key="m.title"
          class="module-card"
          @click="router.push(m.path)"
          :style="{ '--card-gradient': m.gradient }"
        >
          <div class="module-icon-bg" :style="{ background: m.gradient }">
            <span class="module-icon">{{ m.icon }}</span>
          </div>
          <div class="module-body">
            <h3>{{ m.title }}</h3>
            <p>{{ m.desc }}</p>
          </div>
          <div class="module-shimmer"></div>
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
.home {
  margin: -24px -20px 0;
  position: relative;
}

.loading-overlay {
  position: fixed; inset: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.loading-spinner {
  width: 40px; height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #0066cc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* ======== Hero ======== */
.hero {
  position: relative;
  background: linear-gradient(160deg, #070f1c 0%, #0a1a33 35%, #0d2b55 70%, #0a1a33 100%);
  color: #fff;
  padding: 80px 40px 60px;
  overflow: hidden;
  min-height: 520px;
  display: flex;
  align-items: flex-start;
  gap: 40px;
}

/* 蓝色网格背景 */
.hero-grid-bg {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(0, 204, 170, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 204, 170, 0.04) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at 50% 30%, black 30%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at 50% 30%, black 30%, transparent 70%);
  pointer-events: none;
}

.hero-particles {
  position: absolute; inset: 0;
  pointer-events: none;
}
.particle {
  position: absolute;
  width: 3px; height: 3px;
  background: rgba(0, 204, 170, 0.5);
  border-radius: 50%;
  top: -10px; left: var(--x);
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
  position: relative; z-index: 2;
  flex: 1; max-width: 520px;
  animation: fadeInUp 0.8s ease-out;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-badge {
  display: inline-block; padding: 6px 16px;
  background: rgba(0, 204, 170, 0.12);
  border: 1px solid rgba(0, 204, 170, 0.25);
  border-radius: 20px;
  font-size: 13px; color: #00ccaa;
  margin-bottom: 20px;
  animation: fadeIn 0.6s ease-out 0.2s both;
}
.hero-title {
  font-size: 48px; font-weight: 800;
  letter-spacing: 6px; margin-bottom: 12px;
  background: linear-gradient(90deg, #00ccaa, #3399ff, #66bbff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: fadeIn 0.6s ease-out 0.4s both;
}
.hero-slogan {
  font-size: 22px; color: rgba(255,255,255,0.8);
  margin-bottom: 16px; font-weight: 300; letter-spacing: 4px;
  animation: fadeIn 0.6s ease-out 0.6s both;
}
.hero-desc {
  font-size: 15px; color: rgba(255,255,255,0.5);
  line-height: 1.7; margin-bottom: 32px;
  animation: fadeIn 0.6s ease-out 0.8s both;
}

.hero-actions {
  display: flex; gap: 16px;
  animation: fadeIn 0.6s ease-out 1s both;
}
.hero-btn {
  padding: 12px 32px; border-radius: 8px;
  font-size: 15px; font-weight: 600; text-decoration: none;
  transition: all 0.3s;
}
.hero-btn.primary {
  background: linear-gradient(135deg, #00ccaa, #0099cc);
  color: #fff;
}
.hero-btn.primary:hover {
  box-shadow: 0 4px 24px rgba(0,204,170,0.4);
  transform: translateY(-2px);
}
.hero-btn.outline {
  border: 1px solid rgba(255,255,255,0.3);
  color: rgba(255,255,255,0.9);
}
.hero-btn.outline:hover {
  border-color: #fff;
  background: rgba(255,255,255,0.08);
}

/* ======== Hero 右侧统计玻璃卡片 ======== */
.hero-stats {
  position: relative; z-index: 2;
  flex-shrink: 0; width: 380px;
  animation: fadeIn 0.8s ease-out 0.6s both;
}
.stats-glass {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px;
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.stat-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  transition: all 0.2s;
  cursor: default;
  animation: statSlideIn 0.5s ease-out both;
  animation-delay: calc(0.6s + var(--i) * 0.08s);
}
.stat-row:hover {
  background: rgba(0, 204, 170, 0.06);
}
@keyframes statSlideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.stat-icon-wrap {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 204, 170, 0.1);
  border-radius: 10px;
  flex-shrink: 0;
}
.stat-icon {
  font-size: 22px; line-height: 1;
}
.stat-body { flex: 1; min-width: 0; }
.stat-value {
  font-size: 20px; font-weight: 700;
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  color: #00ccaa;
  line-height: 1.3; display: block;
}
.stat-value small {
  font-size: 12px; font-weight: 400;
  color: rgba(255,255,255,0.35); margin-left: 2px;
}
.stat-label { font-size: 13px; color: rgba(255,255,255,0.6); display: block; }

/* ======== 轨道动画 ======== */
.hero-visual {
  position: absolute; right: 5%; top: 50%;
  transform: translateY(-50%);
  width: 280px; height: 280px;
}
.orbit {
  position: absolute;
  border: 1px solid rgba(0,204,170,0.1);
  border-radius: 50%;
  animation: spin 20s linear infinite;
}
.orbit-1 { width: 280px; height: 280px; top: 0; left: 0; }
.orbit-2 { width: 200px; height: 200px; top: 40px; left: 40px; animation-duration: 15s; animation-direction: reverse; border-color: rgba(0,102,204,0.1); }
.orbit-3 { width: 120px; height: 120px; top: 80px; left: 80px; animation-duration: 10s; }

.orbit-dot {
  position: absolute; width: 6px; height: 6px;
  background: #00ccaa; border-radius: 50%;
  top: -3px; left: 50%; transform: translateX(-50%);
  box-shadow: 0 0 8px rgba(0,204,170,0.6);
}
.center-glow {
  position: absolute;
  width: 50px; height: 50px;
  top: 115px; left: 115px;
  background: radial-gradient(circle, rgba(0,204,170,0.25), transparent 70%);
  border-radius: 50%;
  animation: pulse 3s ease-in-out infinite;
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes pulse { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.15); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* ======== 功能模块 — 大图标渐变卡片 ======== */
.modules-section,
.articles-section,
.tools-section {
  padding: 48px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.section-title {
  font-size: 24px; font-weight: 700;
  margin-bottom: 24px;
  padding-left: 12px;
  border-left: 4px solid var(--primary);
  background: linear-gradient(90deg, var(--primary), #3399ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.section-title::before {
  content: none;
}

.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.module-card {
  position: relative;
  border-radius: 16px;
  padding: 0;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  overflow: hidden;
  background: #fff;
}
.module-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.12);
}

/* 图标横幅 — 平铺占满顶部 */
.module-icon-bg {
  width: 100%;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.module-icon-bg::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.08) 100%);
  pointer-events: none;
}
.module-icon {
  font-size: 52px;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
  transition: transform 0.3s;
}
.module-card:hover .module-icon {
  transform: scale(1.15);
}

.module-body {
  padding: 16px 20px 20px;
  position: relative;
}
.module-body h3 {
  font-size: 16px; font-weight: 700; margin-bottom: 6px;
}
.module-body p {
  font-size: 13px; color: var(--text-light); line-height: 1.5;
}

/* 流光 shimmer 效果 */
.module-shimmer {
  position: absolute; top: 0; left: -100%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
  transition: none;
  pointer-events: none;
}
.module-card:hover .module-shimmer {
  animation: shimmer 0.8s ease-out;
}
@keyframes shimmer {
  from { left: -60%; }
  to { left: 160%; }
}

/* ======== 文章卡片 ======== */
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
  box-shadow: 0 8px 30px rgba(0,0,0,0.1);
  transform: translateY(-4px);
}
.article-meta {
  display: flex; justify-content: space-between;
  margin-bottom: 8px; font-size: 12px; color: var(--text-light);
}
.article-category { color: var(--primary); font-weight: 500; }
.article-card h3 { font-size: 16px; margin-bottom: 8px; line-height: 1.4; }
.article-card p {
  font-size: 13px; color: var(--text-light); line-height: 1.6;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.article-footer {
  display: flex; justify-content: space-between;
  margin-top: 12px; font-size: 12px; color: var(--text-light);
}

/* ======== 工具卡片 ======== */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.tool-card {
  background: #fff;
  border-radius: var(--radius);
  padding: 20px; text-align: center;
  cursor: pointer; transition: all 0.3s;
  box-shadow: var(--shadow);
}
.tool-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}
.tool-icon { font-size: 36px; display: block; margin-bottom: 12px; transition: transform 0.3s; }
.tool-card:hover .tool-icon { transform: scale(1.2); }
.tool-card h4 { font-size: 14px; margin-bottom: 4px; }
.tool-card p { font-size: 12px; color: var(--text-light); }
.tool-badge {
  display: inline-block; margin-top: 8px;
  padding: 2px 8px; background: var(--primary-light);
  color: var(--primary); border-radius: 4px; font-size: 11px;
}

/* ======== 响应式 ======== */
@media (max-width: 1024px) {
  .hero { flex-direction: column; align-items: center; text-align: center; gap: 24px; }
  .hero-content { max-width: 100%; }
  .hero-actions { justify-content: center; }
  .hero-stats { width: 100%; max-width: 420px; }
  .hero-visual { display: none; }
}
@media (max-width: 768px) {
  .hero { padding: 48px 20px 40px; min-height: auto; }
  .hero-title { font-size: 32px; }
  .hero-slogan { font-size: 18px; }
  .stat-value { font-size: 18px; }
  .stats-glass { padding: 12px; gap: 6px; }
  .stat-row { padding: 8px 10px; }
  .stat-icon-wrap { width: 36px; height: 36px; }
  .stat-icon { font-size: 18px; }
  .module-icon-bg { height: 100px; }
  .module-icon { font-size: 40px; }
}
</style>
