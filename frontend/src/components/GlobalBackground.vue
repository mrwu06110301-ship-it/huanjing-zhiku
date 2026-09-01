<script setup lang="ts">
/**
 * 全局主题背景 — 监测 · 环保 · 光学氛围层
 *
 * 设计约束：
 * 1. position:fixed; inset:0; z-index:0 —— 挂在 body 上、app-wrapper 之下，全站透出
 * 2. 纯装饰，pointer-events:none，不与任何模块交互冲突
 * 3. 视觉元素：冷调浅蓝灰渐变（光学/遥感底色）+ 检测网格（监测布点）+
 *    漂移光斑（光学散射）+ 两道白色斜光束（激光光谱）+ 缓升粒子（大气扩散）
 * 4. 浅色深化方案：背景比纯白深一档，页内深色文字天然可读、白卡片协调
 * 5. prefers-reduced-motion：所有动画停用，仅保留静态渐变
 */
import { onMounted, onBeforeUnmount, ref } from "vue";

interface Particle {
  left: number;      // 初始水平位置 %
  size: number;      // 直径 px
  duration: number;  // 一次上浮周期 s
  delay: number;     // 负延迟 = 页面加载时已在途中
  drift: number;     // 水平漂移幅度 px
  hue: number;       // 0 = 蓝(主题)，1 = 青(环保点缀)
}

const particles = ref<Particle[]>([]);

function buildParticles(): Particle[] {
  // 粒子数量按视口面积自适应（密度约 1 个 / 60000px²，范围 14~30）
  const area = window.innerWidth * window.innerHeight;
  const count = Math.min(30, Math.max(14, Math.round(area / 60000)));
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    size: 2 + Math.random() * 3,
    duration: 16 + Math.random() * 22,
    delay: -Math.random() * 38,
    drift: 10 + Math.random() * 40,
    hue: Math.random() < 0.72 ? 0 : 1,
  }));
}

onMounted(() => { particles.value = buildParticles(); });
onBeforeUnmount(() => { particles.value = []; });
</script>

<template>
  <div class="gb-root" aria-hidden="true">
    <!-- 基础：深蓝夜空渐变（自上而下加深，底部最沉） -->
    <div class="gb-base"></div>

    <!-- 监测网格：等面积布点/坐标网格，中心亮边缘淡出 -->
    <div class="gb-grid"></div>

    <!-- 光学光斑：两团缓慢漂移的冷光（模拟激光散射/气溶胶光晕） -->
    <div class="gb-glow gb-glow-a"></div>
    <div class="gb-glow gb-glow-b"></div>

    <!-- 激光光束：两道斜向光带（光谱扫描意象，旋转+呼吸） -->
    <svg class="gb-beam gb-beam-1" viewBox="0 0 480 900" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gbBeamA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="45%" stop-color="#ffffff" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#eff6ff" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M240,0 L310,0 L190,900 L120,900 Z" fill="url(#gbBeamA)" />
    </svg>
    <svg class="gb-beam gb-beam-2" viewBox="0 0 480 900" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gbBeamB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ecfeff" stop-opacity="0" />
          <stop offset="50%" stop-color="#ffffff" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#f0fdf4" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M300,0 L350,0 L260,900 L210,900 Z" fill="url(#gbBeamB)" />
    </svg>

    <!-- 大气粒子：自下而上缓升 + 水平漂移（烟羽扩散/洁净大气意象） -->
    <div class="gb-particles">
      <span
        v-for="(p, i) in particles"
        :key="i"
        class="gb-particle"
        :class="p.hue === 1 ? 'gb-particle-teal' : 'gb-particle-blue'"
        :style="{
          left: p.left + '%',
          width: p.size + 'px',
          height: p.size + 'px',
          animationDuration: p.duration + 's',
          animationDelay: p.delay + 's',
          '--drift': p.drift + 'px',
        }"
      ></span>
    </div>

    <!-- 底部地平线微光：页面底部的冷色收边 -->
    <div class="gb-horizon"></div>
  </div>
</template>

<style scoped>
.gb-root {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

/* 基础渐变：浅色深化方案——冷调蓝灰，比纯白 #f8fafc 深一档但保持浅色，
 * 页内深色文字天然可读、白色卡片不刺眼 */
.gb-base {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 120% 70% at 50% -10%, #dde7f5 0%, transparent 60%),
    linear-gradient(180deg, #e8eef7 0%, #e2eaf4 45%, #dde6f2 100%);
}

/* 监测网格：细线网格 + 径向遮罩，只有中部微弱可见 */
.gb-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(37, 99, 235, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37, 99, 235, 0.055) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 90% 80% at 50% 30%, black 0%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse 90% 80% at 50% 30%, black 0%, transparent 75%);
}

/* 光斑：大直径冷光团，20s 级漂移（浅色底上用更饱和的蓝青） */
.gb-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
}
.gb-glow-a {
  width: 640px; height: 640px;
  top: -160px; right: -120px;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, transparent 62%);
  animation: gb-drift-a 26s ease-in-out infinite alternate;
}
.gb-glow-b {
  width: 520px; height: 520px;
  bottom: -140px; left: -100px;
  background: radial-gradient(circle, rgba(6, 182, 212, 0.10) 0%, transparent 60%);
  animation: gb-drift-b 32s ease-in-out infinite alternate;
}

@keyframes gb-drift-a {
  0%   { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-70px, 50px) scale(1.12); }
}
@keyframes gb-drift-b {
  0%   { transform: translate(0, 0) scale(1); }
  100% { transform: translate(60px, -40px) scale(0.92); }
}

/* 光束：细长梯形渐变带，缓慢摆动（浅色底：半透明浅色叠加提亮） */
.gb-beam {
  position: absolute;
  top: 0;
  height: 100%;
  width: 34vw;
  min-width: 320px;
}
.gb-beam-1 { left: 4%; animation: gb-sway 24s ease-in-out infinite alternate; transform-origin: top center; opacity: 0.55; }
.gb-beam-2 { right: 6%; animation: gb-sway 30s ease-in-out infinite alternate-reverse; transform-origin: top center; opacity: 0.45; }

@keyframes gb-sway {
  0%   { transform: rotate(-3.5deg) scale(1); }
  100% { transform: rotate(3deg) scale(1.04); }
}

/* 粒子：底部升起，带水平漂移变量（浅底上用饱和蓝，小而克制） */
.gb-particles { position: absolute; inset: 0; }
.gb-particle {
  position: absolute;
  bottom: -12px;
  border-radius: 50%;
  animation-name: gb-rise;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}
.gb-particle-blue { background: rgba(59, 130, 246, 0.38); box-shadow: 0 0 6px rgba(59, 130, 246, 0.25); }
.gb-particle-teal { background: rgba(13, 148, 136, 0.32); box-shadow: 0 0 6px rgba(13, 148, 136, 0.22); }

@keyframes gb-rise {
  0%   { transform: translate(0, 0) scale(0.6); opacity: 0; }
  8%   { opacity: 0.65; }
  85%  { opacity: 0.45; }
  100% { transform: translate(var(--drift, 24px), -108vh) scale(1); opacity: 0; }
}

/* 底部地平线：轻微加深收边（浅色系） */
.gb-horizon {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 160px;
  background: linear-gradient(180deg, transparent 0%, rgba(205, 218, 234, 0.55) 100%);
}

/* 无障碍：系统偏好减少动效时，全部静止 */
@media (prefers-reduced-motion: reduce) {
  .gb-glow, .gb-beam, .gb-particle { animation: none; }
  .gb-particle { opacity: 0; }
}

/* 移动端：减少光束/网格强度，保粒子 */
@media (max-width: 768px) {
  .gb-beam { width: 60vw; opacity: 0.7; }
  .gb-grid { background-size: 40px 40px; opacity: 0.7; }
}
</style>
