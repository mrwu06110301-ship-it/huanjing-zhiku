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
  const duration = 1200;
  const steps = 50;
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

// 统计数据
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

// 功能模块 — 现代简约配色（单色系 + 透明度变化）
const modules = [
  {
    title: "技术论坛",
    desc: "数智化畅享 · 案例分享 · 技术探讨",
    icon: "forum",
    path: "/forum",
  },
  {
    title: "学习视频",
    desc: "知识科普 · 实操演示 · 技术讲解",
    icon: "video",
    path: "/videos",
  },
  {
    title: "方法标准",
    desc: "标准文档 · 标准解读 · 选型手册",
    icon: "standard",
    path: "/standards",
  },
  {
    title: "常见问题",
    desc: "现场问题 · 设备维护 · 用户答疑",
    icon: "faq",
    path: "/faq",
  },
  {
    title: "常用工具",
    desc: "采样模型 · 单位换算 · 布点计算",
    icon: "tool",
    path: "/tools",
  },
];
</script>

<template>
  <div class="home">
    <!-- ===== Hero 区域 ===== -->
    <section class="hero">
      <div class="hero-grid-bg"></div>
      <div class="hero-glow"></div>
      <div class="hero-content">
        <div class="hero-badge">
          <Icon name="rocket" :size="14" />
          <span>环境监测技术平台</span>
        </div>
        <h1 class="hero-title">产品小吴知识库</h1>
        <p class="hero-slogan">让现场监测，触手可感</p>
        <p class="hero-desc">
          聚焦环境监测领域，提供技术交流、学习视频、方法标准、现场问题解决方案与专业计算工具
        </p>
        <div class="hero-actions">
          <router-link to="/forum" class="hero-btn primary">
            <span>进入论坛</span>
            <Icon name="arrowRight" :size="16" />
          </router-link>
          <router-link to="/tools" class="hero-btn outline">
            <span>使用工具</span>
            <Icon name="arrowRight" :size="16" />
          </router-link>
        </div>
      </div>

      <!-- Hero 右侧统计面板 -->
      <div class="hero-stats">
        <div class="stats-grid">
          <div class="stat-item" v-for="(s, i) in stats" :key="s.label" :style="{ '--i': i }">
            <div class="stat-icon">
              <Icon :name="s.icon" :size="22" />
            </div>
            <span class="stat-val">{{ s.value }}<small>{{ s.suffix }}</small></span>
            <span class="stat-label">{{ s.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 功能模块 ===== -->
    <section class="modules-section">
      <h2 class="section-title">探索功能</h2>
      <div class="modules-grid">
        <div
          v-for="m in modules"
          :key="m.title"
          class="module-card"
          @click="router.push(m.path)"
        >
          <div class="module-icon">
            <Icon :name="m.icon" :size="28" :stroke="3" />
          </div>
          <div class="module-body">
            <h3>{{ m.title }}</h3>
            <p>{{ m.desc }}</p>
          </div>
          <Icon name="arrowRight" :size="16" class="module-arrow" />
        </div>
      </div>
    </section>

    <!-- ===== 最新文章 ===== -->
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

    <!-- ===== 常用工具 ===== -->
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
            <Icon :name="getToolIcon(tool.slug)" :size="26" :stroke="3" />
          </div>
          <div class="tool-info">
            <h4>{{ tool.name }}</h4>
            <p>{{ tool.description }}</p>
          </div>
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
  background: rgba(248, 250, 252, 0.85);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.loading-spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(37, 99, 235, 0.12);
  border-top: 3px solid var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* ======== Hero ======== */
.hero {
  position: relative;
  background: var(--gradient-dark);
  color: #fff;
  padding: 80px 48px 72px;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 48px;
}

.hero-grid-bg {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(96, 165, 250, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(96, 165, 250, 0.035) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse at 40% 40%, black 20%, transparent 72%);
  -webkit-mask-image: radial-gradient(ellipse at 40% 40%, black 20%, transparent 72%);
  pointer-events: none;
}

.hero-glow {
  position: absolute;
  width: 560px; height: 560px;
  top: -180px; right: -80px;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.14), transparent 62%);
  pointer-events: none;
  animation: pulse 10s ease-in-out infinite;
}

.hero-content {
  position: relative; z-index: 2;
  flex: 1;
  max-width: 540px;
  animation: fadeInUp 0.7s var(--ease);
}

.hero-badge {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 6px 14px;
  background: rgba(96, 165, 250, 0.09);
  border: 1px solid rgba(96, 165, 250, 0.16);
  border-radius: 999px;
  font-size: 12.5px; color: #93c5fd;
  letter-spacing: 1px;
  margin-bottom: 22px;
  animation: fadeIn 0.5s ease-out 0.15s both;
}

.hero-title {
  font-size: 46px; font-weight: 800;
  letter-spacing: 2px; margin-bottom: 12px;
  color: #fff;
  animation: fadeIn 0.5s ease-out 0.25s both;
}
.hero-slogan {
  font-size: 20px; color: rgba(255,255,255,0.62);
  margin-bottom: 16px; font-weight: 300; letter-spacing: 4px;
  animation: fadeIn 0.5s ease-out 0.35s both;
}
.hero-desc {
  font-size: 14.5px; color: rgba(255,255,255,0.42);
  line-height: 1.9; margin-bottom: 32px;
  max-width: 460px;
  animation: fadeIn 0.5s ease-out 0.45s both;
}

.hero-actions {
  display: flex; gap: 14px;
  animation: fadeIn 0.5s ease-out 0.55s both;
}
.hero-btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 11px 26px; border-radius: var(--radius);
  font-size: 14.5px; font-weight: 600; text-decoration: none;
  transition: all 0.25s var(--ease);
}
.hero-btn.primary {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 4px 18px rgba(37, 99, 235, 0.35);
}
.hero-btn.primary:hover {
  background: var(--primary-dark);
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(37, 99, 235, 0.45);
}
.hero-btn.outline {
  border: 1px solid rgba(255,255,255,0.16);
  color: rgba(255,255,255,0.82);
}
.hero-btn.outline:hover {
  border-color: rgba(96, 165, 250, 0.45);
  background: rgba(96, 165, 250, 0.07);
  color: #93c5fd;
}

/* ======== Hero 统计面板 ======== */
.hero-stats {
  position: relative; z-index: 2;
  flex-shrink: 0;
  width: 400px;
  animation: fadeIn 0.6s ease-out 0.4s both;
}
.stats-grid {
  background: rgba(255,255,255,0.028);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: var(--radius-lg);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-item {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--radius);
  transition: all 0.2s var(--ease);
  cursor: default;
  animation: statIn 0.45s ease-out both;
  animation-delay: calc(0.5s + var(--i) * 0.07s);
}
.stat-item:hover {
  background: rgba(96, 165, 250, 0.07);
}
@keyframes statIn {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: translateX(0); }
}
.stat-icon {
  width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: rgba(37, 99, 235, 0.13);
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: var(--radius-sm);
  color: #60a5fa;
  transition: all 0.2s var(--ease);
}
.stat-item:hover .stat-icon {
  background: rgba(96, 165, 250, 0.2);
  border-color: rgba(96, 165, 250, 0.3);
  color: #93c5fd;
}
/* 数字+单位整体落在行水平中心（1fr auto 1fr 的中列） */
.stat-icon { justify-self: start; }
.stat-val {
  justify-self: center;
  font-size: 24px;
  font-weight: 700;
  font-family: "JetBrains Mono", "SF Mono", "Consolas", monospace;
  color: #e2e8f0;
  line-height: 1.2;
  white-space: nowrap;
}
.stat-val small {
  font-size: 12px; font-weight: 400;
  color: rgba(255,255,255,0.3); margin-left: 3px;
}
.stat-label {
  justify-self: end;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
}

/* ======== 通用 Section ======== */
.modules-section,
.articles-section,
.tools-section {
  padding: 52px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.section-title {
  font-size: 21px; font-weight: 700;
  margin-bottom: 22px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-title::before {
  content: '';
  width: 4px; height: 20px;
  border-radius: 2px;
  background: var(--gradient-primary);
}

/* ======== 功能模块 ======== */
.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}

.module-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--white);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px;
  cursor: pointer;
  transition: all 0.25s var(--ease);
  box-shadow: var(--shadow);
}
.module-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
  border-color: rgba(37, 99, 235, 0.25);
}

.module-icon {
  width: 52px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: var(--primary-light);
  color: var(--primary);
  border-radius: var(--radius);
  transition: all 0.25s var(--ease);
}
.module-card:hover .module-icon {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 4px 14px var(--primary-glow);
}

.module-body { flex: 1; min-width: 0; }
.module-body h3 {
  font-size: 15.5px; font-weight: 700; margin-bottom: 3px;
}
.module-body p {
  font-size: 12.5px; color: var(--text-muted); line-height: 1.5;
}

.module-arrow {
  color: var(--text-muted);
  opacity: 0;
  transform: translateX(-6px);
  transition: all 0.25s var(--ease);
  flex-shrink: 0;
}
.module-card:hover .module-arrow {
  opacity: 1;
  transform: translateX(0);
  color: var(--primary);
}

/* ======== 文章卡片 ======== */
.articles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 18px;
}
.article-card {
  background: var(--white);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px;
  cursor: pointer;
  transition: all 0.25s var(--ease);
  box-shadow: var(--shadow);
}
.article-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-3px);
  border-color: rgba(37, 99, 235, 0.22);
}
.article-meta {
  display: flex; justify-content: space-between;
  margin-bottom: 10px; font-size: 12px;
}
.article-category {
  color: var(--primary); font-weight: 600;
  padding: 2px 10px; background: var(--primary-light);
  border-radius: 5px;
}
.article-date { color: var(--text-muted); }
.article-card h3 { font-size: 15.5px; margin-bottom: 8px; line-height: 1.5; font-weight: 600; }
.article-card p {
  font-size: 13px; color: var(--text-light); line-height: 1.65;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.article-footer {
  display: flex; justify-content: space-between;
  margin-top: 14px; font-size: 12px; color: var(--text-muted);
  padding-top: 12px; border-top: 1px solid var(--border-light);
}
.article-author, .article-views {
  display: flex; align-items: center; gap: 5px;
}

/* ======== 工具卡片 ======== */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.tool-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--white);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  cursor: pointer;
  transition: all 0.25s var(--ease);
  box-shadow: var(--shadow);
}
.tool-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
  border-color: rgba(37, 99, 235, 0.22);
}
.tool-icon-wrap {
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: var(--primary-light);
  border-radius: var(--radius);
  color: var(--primary);
  transition: all 0.25s var(--ease);
}
.tool-card:hover .tool-icon-wrap {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 4px 14px var(--primary-glow);
}
.tool-info { flex: 1; min-width: 0; }
.tool-info h4 { font-size: 14.5px; margin-bottom: 3px; font-weight: 600; }
.tool-info p {
  font-size: 12px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tool-badge {
  flex-shrink: 0;
  padding: 3px 10px;
  background: var(--bg-soft);
  color: var(--text-light);
  border-radius: 5px;
  font-size: 11px;
  border: 1px solid var(--border);
}

/* ======== 响应式 ======== */
@media (max-width: 1024px) {
  .hero { flex-direction: column; align-items: stretch; text-align: center; padding: 56px 24px; gap: 36px; }
  .hero-content { max-width: 100%; }
  .hero-desc { margin-left: auto; margin-right: auto; }
  .hero-actions { justify-content: center; }
  .hero-stats { width: 100%; max-width: 460px; margin: 0 auto; }
}
@media (max-width: 768px) {
  .hero { padding: 44px 18px 40px; }
  .hero-title { font-size: 32px; }
  .hero-slogan { font-size: 16px; letter-spacing: 3px; }
  .stat-val { font-size: 20px; }
  .stat-icon { width: 38px; height: 38px; }
  .stat-label { font-size: 13px; }
  .modules-grid { grid-template-columns: 1fr; }
  .articles-grid { grid-template-columns: 1fr; }
  .tools-grid { grid-template-columns: 1fr; }
}
</style>
