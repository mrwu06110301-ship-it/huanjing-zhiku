<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import bgFlueGas from "@/assets/game/bg-flue-gas.webp";
import bgDust from "@/assets/game/bg-dust.webp";
import bgAirQuality from "@/assets/game/bg-air-quality.webp";
import bgWater from "@/assets/game/bg-water.webp";
import bgLdar from "@/assets/game/bg-ldar.webp";
import bgNoise from "@/assets/game/bg-noise.webp";

/** 场景卡数据 — 与现场监测业务挂钩，open 字段预留后续开放 */
interface Scene {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: 1 | 2 | 3;
  color: string;
  icon: string;
  bg: string;
  open: boolean;
}

const scenes = ref<Scene[]>([
  {
    id: "flue-gas",
    name: "烟气探秘",
    subtitle: "固定污染源废气监测",
    description: "走进烟囱脚下，布设采样点位，选对采样嘴，挑战等速采样！",
    difficulty: 2,
    color: "#f97316",
    icon: "chimney",
    bg: bgFlueGas,
    open: false,
  },
  {
    id: "dust",
    name: "粉尘猎手",
    subtitle: "颗粒物 β 射线测定",
    description: "操控 β 射线测尘仪，捕捉看不见的颗粒物，找出超标排放源！",
    difficulty: 3,
    color: "#8b5cf6",
    icon: "experiment",
    bg: bgDust,
    open: false,
  },
  {
    id: "air-quality",
    name: "空气哨兵",
    subtitle: "环境空气质量监测",
    description: "布设空气采样点，识别污染气象条件，守护城市每一口呼吸！",
    difficulty: 1,
    color: "#06b6d4",
    icon: "wind",
    bg: bgAirQuality,
    open: false,
  },
  {
    id: "water",
    name: "碧水行动",
    subtitle: "水样采集与保存",
    description: "选对采样瓶与固定剂，低温保存限时送达，别让水样变质！",
    difficulty: 2,
    color: "#3b82f6",
    icon: "waterLevel",
    bg: bgWater,
    open: false,
  },
  {
    id: "ldar",
    name: "泄漏侦探",
    subtitle: "LDAR 泄漏检测与修复",
    description: "手持检测仪巡检管线法兰，揪出无组织排放泄漏点！",
    difficulty: 3,
    color: "#ef4444",
    icon: "search",
    bg: bgLdar,
    open: false,
  },
  {
    id: "noise",
    name: "声音捕手",
    subtitle: "厂界噪声监测",
    description: "选对测量时段与点位，排除背景噪声干扰，精准取证！",
    difficulty: 1,
    color: "#10b981",
    icon: "chart",
    bg: bgNoise,
    open: false,
  },
]);

/* ---------- 整页场景背景（双图层交叉淡入） ---------- */
const bgLayerA = ref(true);        // 当前显示 A 还是 B
const bgUrlA = ref("");
const bgUrlB = ref("");
const activeBg = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const flashPos = ref({ x: 50, y: 40 });
const flashKey = ref(0);

const selectedScene = computed(() => scenes.value.find((s) => s.id === selectedId.value));

function pickScene(s: Scene, e: MouseEvent) {
  selectedId.value = s.id;

  // 点击位置（用于光波闪动起点）
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  flashPos.value = {
    x: Math.round(((rect.left + rect.width / 2) / window.innerWidth) * 100),
    y: Math.round(((rect.top + rect.height / 2) / window.innerHeight) * 100),
  };
  flashKey.value += 1;

  // 背景交叉淡入：写入隐藏图层再切换
  if (activeBg.value !== s.bg) {
    if (bgLayerA.value) bgUrlB.value = s.bg;
    else bgUrlA.value = s.bg;
    bgLayerA.value = !bgLayerA.value;
    activeBg.value = s.bg;
  }

  ElMessage({
    message: `「${s.name}」场景暂未开放，敬请期待！`,
    type: "warning",
    duration: 2200,
  });
}

function resetScene() {
  selectedId.value = null;
  activeBg.value = null;
  bgUrlA.value = "";
  bgUrlB.value = "";
  bgLayerA.value = true;
}

function glowStyle(color: string) {
  return `radial-gradient(ellipse 70% 55% at 50% 115%, color-mix(in srgb, ${color} 22%, transparent), transparent 70%)`;
}

function difficultyLabel(n: number) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}
</script>

<template>
  <div class="game-page">
    <!-- 整页场景背景（固定层，随卡片点击切换） -->
    <div class="game-backdrop" aria-hidden="true">
      <div
        class="bg-layer"
        :class="{ on: bgLayerA && !!bgUrlA }"
        :style="bgUrlA ? { backgroundImage: `url(${bgUrlA})` } : {}"
      ></div>
      <div
        class="bg-layer"
        :class="{ on: !bgLayerA && !!bgUrlB }"
        :style="bgUrlB ? { backgroundImage: `url(${bgUrlB})` } : {}"
      ></div>
      <!-- 可读性纱罩：保证文字对比度 -->
      <div class="bg-veil"></div>
      <!-- 场景主题色氛围光 -->
      <div
        v-if="selectedScene"
        :key="'glow-' + selectedScene.id"
        class="bg-glow"
        :style="{ background: glowStyle(selectedScene.color) }"
      ></div>
      <!-- 点击光波闪动 -->
      <div
        v-if="selectedScene"
        :key="'flash-' + flashKey"
        class="bg-flash"
        :style="{
          '--fc': selectedScene.color,
          '--fx': flashPos.x + '%',
          '--fy': flashPos.y + '%',
        }"
      ></div>
    </div>

    <!-- 页头 -->
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon game-icon">
            <Icon name="game" :size="26" />
          </div>
          <h1>环监奇兵</h1>
        </div>
        <p class="page-header-sub">现场监测知识闯关 · 点击场景卡，整页氛围随场景切换（开发中，场景陆续开放）</p>
      </div>
      <div v-if="selectedScene" class="header-right">
        <button class="reset-btn" @click="resetScene">
          <Icon name="refresh" :size="13" /> 恢复默认
        </button>
      </div>
    </div>

    <!-- 场景选卡 -->
    <div class="scene-grid">
      <button
        v-for="s in scenes"
        :key="s.id"
        class="scene-card"
        :class="{ selected: s.id === selectedId }"
        :style="{ '--sc': s.color }"
        @click="pickScene($event, s)"
      >
        <!-- 未开放角标 -->
        <span class="soon-badge"><Icon name="close" :size="10" /> 敬请期待</span>

        <!-- 卡头：图标区 -->
        <div class="scene-hero">
          <div class="scene-icon">
            <Icon :name="s.icon" :size="40" :stroke="1.2" />
          </div>
          <div class="scene-diff" :title="`难度 ${s.difficulty}/3`">{{ difficultyLabel(s.difficulty) }}</div>
        </div>

        <!-- 卡体 -->
        <div class="scene-body">
          <h3 class="scene-name">{{ s.name }}</h3>
          <p class="scene-subtitle">{{ s.subtitle }}</p>
          <p class="scene-desc">{{ s.description }}</p>
        </div>

        <!-- 底部：进入提示（悬停浮现 / 选中常显） -->
        <div class="scene-footer">
          <span v-if="s.id === selectedId" class="enter-hint staying">
            <Icon name="eye" :size="13" /> 正在欣赏此场景
          </span>
          <span v-else class="enter-hint">即将开放 <Icon name="arrowRight" :size="13" /></span>
        </div>
      </button>
    </div>

    <!-- 底部说明 -->
    <div class="game-note">
      <Icon name="info" :size="14" />
      「环监奇兵」将现场监测规范要点融入闯关玩法：布点选位、仪器操作、数据研判一网打尽。场景开发中，开放后可从本页进入。
    </div>
  </div>
</template>

<style scoped>
.game-page {
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

/* ---------- 整页背景层 ---------- */
.game-backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.bg-layer {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0;
  transition: opacity 0.9s ease;
  will-change: opacity;
}
.bg-layer.on { opacity: 0.36; }
.bg-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(232, 238, 247, 0.30) 0%,
    rgba(232, 238, 247, 0.50) 55%,
    rgba(232, 238, 247, 0.68) 100%
  );
}
.bg-glow {
  position: absolute;
  inset: 0;
  animation: glowIn 1.1s ease both;
}
@keyframes glowIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.bg-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at var(--fx, 50%) var(--fy, 40%),
    color-mix(in srgb, var(--fc, #2563eb) 40%, transparent),
    transparent 52%
  );
  animation: flashOut 0.75s ease both;
}
@keyframes flashOut {
  0% { opacity: 0; }
  22% { opacity: 1; }
  100% { opacity: 0; }
}

/* 页头 */
.game-icon { background: linear-gradient(135deg, #fef3c7, #fde68a); color: #d97706; }
.header-right { flex-shrink: 0; }
.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--card-border);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s var(--ease);
}
.reset-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
}

/* 场景网格 */
.scene-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

/* 场景卡片（玻璃拟态，压得住背景） */
.scene-card {
  --sc: var(--primary);
  position: relative;
  display: flex;
  flex-direction: column;
  text-align: left;
  border: 1.5px solid var(--card-border);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
  padding: 0;
}
.scene-card::before {
  /* 顶部主题色渐变条，悬停/选中时点亮 */
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--sc), transparent);
  opacity: 0.25;
  transition: opacity 0.25s;
}
.scene-card:hover {
  transform: translateY(-6px);
  border-color: var(--sc);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
}
.scene-card:hover::before { opacity: 1; }

/* 选中态：常亮 + 主题色投影 */
.scene-card.selected {
  border-color: var(--sc);
  box-shadow: 0 16px 36px color-mix(in srgb, var(--sc) 28%, transparent);
  transform: translateY(-3px);
}
.scene-card.selected::before { opacity: 1; }

/* 敬请期待角标 */
.soon-badge {
  position: absolute;
  top: 14px; right: -34px;
  transform: rotate(45deg);
  background: linear-gradient(135deg, #94a3b8, #64748b);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 40px;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.2);
  letter-spacing: 1px;
  z-index: 1;
}

/* 卡头 */
.scene-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 22px 0;
}
.scene-icon {
  width: 76px;
  height: 76px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sc);
  background: color-mix(in srgb, var(--sc) 10%, transparent);
  transition: transform 0.25s var(--ease);
}
.scene-card:hover .scene-icon { transform: scale(1.08) rotate(-3deg); }
.scene-diff {
  font-size: 13px;
  color: #f59e0b;
  letter-spacing: 2px;
}

/* 卡体 */
.scene-body { padding: 16px 22px 0; flex: 1; }
.scene-name {
  font-size: 19px;
  font-weight: 800;
  color: var(--text);
  margin: 0 0 4px;
}
.scene-subtitle {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--sc);
  margin: 0 0 10px;
}
.scene-desc {
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text-light);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 卡底 */
.scene-footer {
  padding: 14px 22px 18px;
  display: flex;
  justify-content: flex-end;
}
.enter-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sc);
  opacity: 0;
  transform: translateX(-6px);
  transition: all 0.25s var(--ease);
}
.scene-card:hover .enter-hint { opacity: 0.75; transform: translateX(0); }
.enter-hint.staying { opacity: 1; transform: translateX(0); }

/* 底部说明 */
.game-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  background: color-mix(in srgb, var(--primary-light, #eff6ff) 88%, transparent);
  backdrop-filter: blur(10px);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-light);
  margin-bottom: 8px;
}

@media (max-width: 900px) {
  .scene-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
}
@media (max-width: 600px) {
  .scene-grid { grid-template-columns: 1fr; }
  .scene-hero { padding: 18px 18px 0; }
  .scene-body { padding: 14px 18px 0; }
  .scene-footer { padding: 12px 18px 16px; }
  .bg-layer.on { opacity: 0.3; }
}

/* 动效弱化偏好 */
@media (prefers-reduced-motion: reduce) {
  .bg-layer, .bg-glow, .bg-flash, .scene-card, .scene-icon, .enter-hint, .reset-btn {
    transition: none;
    animation: none;
  }
}
</style>
