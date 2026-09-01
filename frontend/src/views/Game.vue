<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";

/** 场景卡数据 — 与现场监测业务挂钩，game 字段预留后续开放 */
interface Scene {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: 1 | 2 | 3;
  color: string;
  icon: string;
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
    open: false,
  },
]);

const activeScene = computed(() => scenes.value.find((s) => s.open));

function pickScene(s: Scene) {
  ElMessage({
    message: `「${s.name}」场景暂未开放，敬请期待！`,
    type: "warning",
    duration: 2200,
  });
}

function difficultyLabel(n: number) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}
</script>

<template>
  <div class="game-page">
    <!-- 页头 -->
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon game-icon">
            <Icon name="game" :size="26" />
          </div>
          <h1>环监奇兵</h1>
        </div>
        <p class="page-header-sub">现场监测知识闯关 · 在游戏里练成监测高手（开发中，场景陆续开放）</p>
      </div>
    </div>

    <!-- 场景选卡 -->
    <div class="scene-grid">
      <button
        v-for="s in scenes"
        :key="s.id"
        class="scene-card"
        :style="{ '--sc': s.color }"
        @click="pickScene(s)"
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

        <!-- 底部：进入提示（悬停浮现） -->
        <div class="scene-footer">
          <span class="enter-hint">即将开放 <Icon name="arrowRight" :size="13" /></span>
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
.game-page { max-width: 1200px; margin: 0 auto; }

/* 页头 */
.game-icon { background: linear-gradient(135deg, #fef3c7, #fde68a); color: #d97706; }

/* 场景网格 */
.scene-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

/* 场景卡片 */
.scene-card {
  --sc: var(--primary);
  position: relative;
  display: flex;
  flex-direction: column;
  text-align: left;
  border: 1.5px solid var(--card-border);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
  padding: 0;
}
.scene-card::before {
  /* 顶部主题色渐变条，悬停时点亮 */
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

/* 底部说明 */
.game-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  background: var(--primary-light);
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
}
</style>
