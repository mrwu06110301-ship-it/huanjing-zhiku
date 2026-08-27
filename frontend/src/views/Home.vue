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
import Icon from "@/components/Icon.vue";

const router = useRouter();
const latestArticles = ref<ArticleListOut[]>([]);
const videos = ref<VideoOut[]>([]);
const standards = ref<StandardOut[]>([]);
const tools = ref<ToolOut[]>([]);
const loading = ref(true);

// 动画统计数值
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

// 统计数据（简化版，在 Hero 右侧展示）
const stats = computed(() => [
  { label: "技术干货", value: animatedStats.value[0], icon: "doc", suffix: "篇" },
  { label: "精品课程", value: animatedStats.value[1], icon: "play", suffix: "节" },
  { label: "标准规范", value: animatedStats.value[2], icon: "standard", suffix: "项" },
  { label: "专业工具", value: animatedStats.value[3], icon: "calculator", suffix: "个" },
  { label: "维保方案", value: animatedStats.value[4], icon: "wrench", suffix: "条" },
  { label: "用户反馈", value: animatedStats.value[5], icon: "message", suffix: "条" },
]);

function getToolIcon(slug: string): string {
  const map: Record<string, string> = {
    "atmospheric-stability": "trendUp",
    "unit-converter": "layers",
    "air-sampling-model": "flame",
    "pollution-source-model": "fire",
    "doas-model": "beaker",
    "flue-sampling": "filter",
  };
  return map[slug] || "tool";
}

const modules = [
  {
    title: "技术论坛",
    desc: "数智化畅享、案例分享、技术探讨",
    icon: "forum",
    path: "/forum",
    gradient: "linear-gradient(135deg, #0099b8, #00b8d9, #5b7cfa)",
  },
  {
    title: "学习视频",
    desc: "知识科普、实操演示、技术探讨",
    icon: "video",
    path: "/videos",
    gradient: "linear-gradient(135deg, #00b894, #00e6a8, #00f5b8)",
  },
  {
    title: "方法标准",
    desc: "标准文档、标准解读、选型手册",
    icon: "standard",
    path: "/standards",
    gradient: "linear-gradient(135deg, #d97706, #f59e0b, #fbbf24)",
  },
  {
    title: "常见问题",
    desc: "现场问题、设备维护、用户答疑",
    icon: "faq",
    path: "/faq",
    gradient: "linear-gradient(135deg, #dc2626, #ef4444, #f87171)",
  },
  {
    title: "常用工具",
    desc: "采样模型、单位换算、布点计算",
    icon: "tool",
    path: "/tools",
    gradient: "linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)",
  },
];
</script>

<template>
  <div class="home">
    <!-- Hero 区域 -->
    <section class="hero">
      <div class="hero-grid-bg"></div>
      <div class="hero-glow"></div>
      <div class="hero-particles">
        <div class="particle" v-for="i in 20" :key="i" :style="{ '--delay': i * 0.5 + 's', '--x': (i * 7) % 100 + '%' }"></div>
      </div>
      <div class="hero-content">
        <div class="hero-badge">
          <Icon name="atom" :size="14" />
          <span>环境监测技术平台</span>
        </div>
        <h1 class="hero-title">产品小吴知识库</h1>
        <p class="hero-slogan">让现场监测，触手可感</p>
        <p class="hero-desc">
          聚焦环境监测领域，提供技术交流、学习视频、方法标准、现场问题解决方案与专业计算工具
        </p>
        <div class="hero-actions">
          <router-link to="/forum" class="hero-btn primary">
            <Icon name="forum" :size="18" />
            <span>进入论坛</span>
          </router-link>
          <router-link to="/tools" class="hero-btn outline">
            <Icon name="tool" :size="18" />
            <span>使用工具</span>
          </router-link>
        </div>
      </div>

      <!-- Hero 右侧统计卡片 - 2x3 紧凑网格 -->
      <div class="hero-stats">
        <div class="stats-glass">
          <div class="stats-label">平台数据</div>
          <div class="stats-grid">
            <div class="stat-item" v-for="(s, i) in stats" :key="s.label" :style="{ '--i': i }">
              <div class="stat-icon">
                <Icon :name="s.icon" :size="20" />
              </div>
              <div class="stat-val">{{ s.value.toLocaleString() }}</div>
              <div class="stat-unit">{{ s.suffix }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 功能模块 -->
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
            <Icon :name="m.icon" :size="36" :stroke="1.8" class="module-icon" />
          </div>
          <div class="module-body">
            <h3>{{ m.title }}</h3>
            <p>{{ m.desc }}</p>
          </div>
          <div class="module-arrow">
            <Icon name="arrowRight" :size="18" />
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
            <span class="article-author">
              <Icon name="user" :size="13" />
              {{ article.author_name }}
            </span>
            <span class="article-views">
              <Icon name="eye" :size="13" />
              {{ article.view_count }}
            </span>
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
          <div class="tool-icon-wrap">
            <Icon :name="getToolIcon(tool.slug)" :size="28" />
          </div>
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
  background: rgba(240, 244, 248, 0.85);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.loading-spinner {
  width: 44px; height: 44px;
  border: 3px solid rgba(0, 184, 217, 0.15);
  border-top: 3px solid var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* ======== Hero ======== */
.hero {
  position: relative;
  background: var(--gradient-dark);
  color: #fff;
  padding: 72px 40px 56px;
  overflow: hidden;
  min-height: 520px;
  display: flex;
  align-items: flex-start;
  gap: 40px;
}

/* 网格背景 */
.hero-grid-bg {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(0, 230, 168, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 230, 168, 0.04) 1px, transparent 1px);
  background-size: 50px 50px;
  mask-image: radial-gradient(ellipse at 50% 30%, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at 50% 30%, black 20%, transparent 70%);
  pointer-events: none;
}

/* 光晕 */
.hero-glow {
  position: absolute;
  width: 600px; height: 600px;
  top: -200px; right: -100px;
  background: radial-gradient(circle, rgba(0, 184, 217, 0.12), transparent 60%);
  pointer-events: none;
  animation: pulse 8s ease-in-out infinite;
}

.hero-particles {
  position: absolute; inset: 0;
  pointer-events: none;
}
.particle {
  position: absolute;
  width: 3px; height: 3px;
  background: rgba(0, 230, 168, 0.5);
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
  animation: fadeInUp 0.8s var(--ease);
}

.hero-badge {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 18px;
  background: rgba(0, 230, 168, 0.1);
  border: 1px solid rgba(0, 230, 168, 0.2);
  border-radius: 20px;
  font-size: 13px; color: #00e6a8;
  margin-bottom: 24px;
  animation: fadeIn 0.6s ease-out 0.2s both;
}

.hero-title {
  font-size: 52px; font-weight: 800;
  letter-spacing: 4px; margin-bottom: 12px;
  background: linear-gradient(90deg, #00e6a8, #00b8d9, #5b7cfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: fadeIn 0.6s ease-out 0.4s both;
}
.hero-slogan {
  font-size: 22px; color: rgba(255,255,255,0.75);
  margin-bottom: 16px; font-weight: 300; letter-spacing: 3px;
  animation: fadeIn 0.6s ease-out 0.6s both;
}
.hero-desc {
  font-size: 15px; color: rgba(255,255,255,0.45);
  line-height: 1.8; margin-bottom: 32px;
  animation: fadeIn 0.6s ease-out 0.8s both;
}

.hero-actions {
  display: flex; gap: 16px;
  animation: fadeIn 0.6s ease-out 1s both;
}
.hero-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 28px; border-radius: 10px;
  font-size: 15px; font-weight: 600; text-decoration: none;
  transition: all 0.3s var(--ease);
}
.hero-btn.primary {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 4px 20px rgba(0, 184, 217, 0.3);
}
.hero-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0, 184, 217, 0.45);
}
.hero-btn.outline {
  border: 1px solid rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.85);
}
.hero-btn.outline:hover {
  border-color: rgba(0, 230, 168, 0.5);
  background: rgba(0, 230, 168, 0.05);
  color: #00e6a8;
}

/* ======== Hero 右侧统计 ======== */
.hero-stats {
  position: relative; z-index: 2;
  flex-shrink: 0; width: 360px;
  margin-right: -40px;
  align-self: center;
  animation: fadeIn 0.8s ease-out 0.6s both;
}
.stats-glass {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 16px 14px 14px;
}
.stats-label {
  text-align: center;
  font-size: 11px;
  letter-spacing: 4px;
  color: rgba(255,255,255,0.25);
  margin-bottom: 12px;
}
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px 8px;
  border-radius: 10px;
  transition: all 0.25s var(--ease);
  cursor: default;
  animation: statIn 0.5s ease-out both;
  animation-delay: calc(0.6s + var(--i) * 0.06s);
}
.stat-item:hover {
  background: rgba(0, 230, 168, 0.06);
  transform: translateY(-2px);
}
@keyframes statIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.stat-icon {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 184, 217, 0.08);
  border: 1px solid rgba(0, 184, 217, 0.12);
  border-radius: 10px;
  color: #00b8d9;
  transition: all 0.25s var(--ease);
  margin-bottom: 4px;
}
.stat-item:hover .stat-icon {
  background: rgba(0, 230, 168, 0.12);
  border-color: rgba(0, 230, 168, 0.25);
  color: #00e6a8;
  box-shadow: 0 0 12px rgba(0, 230, 168, 0.08);
}
.stat-val {
  font-size: 22px;
  font-weight: 800;
  font-family: "JetBrains Mono", "Cascadia Code", "SF Mono", "Consolas", monospace;
  color: #00e6a8;
  line-height: 1.2;
  transition: color 0.25s var(--ease);
}
.stat-item:hover .stat-val {
  color: #fff;
  text-shadow: 0 0 10px rgba(0, 230, 168, 0.4);
}
.stat-unit {
  font-size: 11px;
  font-weight: 400;
  color: rgba(255,255,255,0.2);
}
.stat-label {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
}

/* ======== 功能模块 ======== */
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
  padding-left: 14px;
  border-left: 4px solid var(--primary);
  color: var(--text);
  position: relative;
}

.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.module-card {
  position: relative;
  border-radius: 14px;
  padding: 0;
  cursor: pointer;
  transition: all 0.35s var(--ease);
  box-shadow: var(--shadow);
  overflow: hidden;
  background: #fff;
}
.module-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--shadow-lg);
}

.module-icon-bg {
  width: 100%;
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.module-icon-bg::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.1) 100%);
  pointer-events: none;
}
.module-icon {
  color: #fff;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.15));
  transition: transform 0.35s var(--ease);
}
.module-card:hover .module-icon {
  transform: scale(1.2);
}

.module-body {
  padding: 14px 18px 16px;
  position: relative;
}
.module-body h3 {
  font-size: 16px; font-weight: 700; margin-bottom: 4px;
}
.module-body p {
  font-size: 13px; color: var(--text-light); line-height: 1.5;
}

.module-arrow {
  position: absolute;
  right: 16px; bottom: 16px;
  color: var(--text-muted);
  opacity: 0;
  transform: translateX(-8px);
  transition: all 0.3s var(--ease);
}
.module-card:hover .module-arrow {
  opacity: 1;
  transform: translateX(0);
  color: var(--primary);
}

/* 流光效果 */
.module-shimmer {
  position: absolute; top: 0; left: -100%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
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
  border-radius: var(--radius-lg);
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s var(--ease);
  box-shadow: var(--shadow);
  border: 1px solid var(--border-light);
}
.article-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-4px);
  border-color: rgba(0, 184, 217, 0.2);
}
.article-meta {
  display: flex; justify-content: space-between;
  margin-bottom: 10px; font-size: 12px;
}
.article-category {
  color: var(--primary); font-weight: 600;
  padding: 2px 10px; background: var(--primary-light);
  border-radius: 4px;
}
.article-date { color: var(--text-muted); }
.article-card h3 { font-size: 16px; margin-bottom: 8px; line-height: 1.5; font-weight: 600; }
.article-card p {
  font-size: 13px; color: var(--text-light); line-height: 1.6;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.article-footer {
  display: flex; justify-content: space-between;
  margin-top: 14px; font-size: 12px; color: var(--text-muted);
  padding-top: 12px; border-top: 1px solid var(--border-light);
}
.article-author, .article-views {
  display: flex; align-items: center; gap: 4px;
}

/* ======== 工具卡片 ======== */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.tool-card {
  background: #fff;
  border-radius: var(--radius-lg);
  padding: 20px; text-align: center;
  cursor: pointer; transition: all 0.3s var(--ease);
  box-shadow: var(--shadow);
  border: 1px solid var(--border-light);
}
.tool-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: rgba(0, 184, 217, 0.2);
}
.tool-icon-wrap {
  width: 56px; height: 56px;
  margin: 0 auto 12px;
  display: flex; align-items: center; justify-content: center;
  background: var(--primary-light);
  border-radius: 14px;
  color: var(--primary);
  transition: all 0.3s var(--ease);
}
.tool-card:hover .tool-icon-wrap {
  background: var(--gradient-primary);
  color: #fff;
  transform: scale(1.1);
  box-shadow: 0 4px 16px var(--primary-glow);
}
.tool-card h4 { font-size: 14px; margin-bottom: 4px; font-weight: 600; }
.tool-card p { font-size: 12px; color: var(--text-light); }
.tool-badge {
  display: inline-block; margin-top: 8px;
  padding: 2px 10px; background: var(--bg-soft);
  color: var(--text-light); border-radius: 4px; font-size: 11px;
  border: 1px solid var(--border);
}

/* ======== 响应式 ======== */
@media (max-width: 1024px) {
  .hero { flex-direction: column; align-items: center; text-align: center; gap: 32px; min-height: auto; padding-bottom: 48px; }
  .hero-content { max-width: 100%; }
  .hero-actions { justify-content: center; }
  .hero-stats { width: 100%; max-width: 460px; margin-right: 0; align-self: auto; }
}
@media (max-width: 768px) {
  .hero { padding: 48px 20px 40px; min-height: auto; }
  .hero-title { font-size: 36px; }
  .hero-slogan { font-size: 18px; }
  .stat-val { font-size: 24px; }
  .stat-label { font-size: 14px; }
  .stat-icon { width: 40px; height: 40px; }
  .module-icon-bg { height: 90px; }
}
</style>
