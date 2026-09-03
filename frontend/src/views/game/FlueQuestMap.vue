<template>
  <div class="fqmap">
    <!-- ===== 地图头 ===== -->
    <div class="fqmap-head">
      <div class="fqmap-title">
        <span class="fqmap-badge">任务地图</span>
        <h3>城东热电厂 · 烟气监测全流程</h3>
      </div>
      <p class="fqmap-sub">接单备勤 → 测前准备 → 排气参数 → 布点 → 等速采样 → 颗粒物称量 → 质控报告 · 进度自动保存</p>
    </div>

    <!-- ===== 地图主体：电厂场景路径 ===== -->
    <div class="fqmap-canvas">
      <!-- 地平线与电厂剪影（纯装饰） -->
      <div class="map-plant">
        <i class="mp-stack s1"><em class="smoke"></em></i>
        <i class="mp-stack s2"></i>
        <i class="mp-boiler"></i>
        <i class="mp-ground"></i>
      </div>
      <div class="map-road"></div>

      <!-- 关卡节点连线 -->
      <svg class="map-path" viewBox="0 0 100 46" preserveAspectRatio="none">
        <path d="M 8 34 C 16 24, 22 38, 30 28 S 44 14, 52 24 S 62 36, 70 26 S 78 14, 84 24 S 90 34, 93 26"
              fill="none" stroke="rgba(96,165,250,.4)" stroke-width="0.7"
              stroke-dasharray="2.2 1.8" class="path-line" />
      </svg>

      <!-- 关卡节点 -->
      <button v-for="n in nodes" :key="n.key" class="node"
              :class="{ [n.state]: true }"
              :style="{ left: n.x + '%', top: n.y + '%' }"
              :disabled="n.state === 'locked'"
              @click="$emit('select', n.key)">
        <span class="node-core">
          <Icon v-if="n.state === 'locked'" name="lock" :size="14" />
          <Icon v-else-if="n.state === 'done'" name="check" :size="14" />
          <b v-else>{{ n.no }}</b>
        </span>
        <span class="node-label">{{ n.label }}</span>
        <span v-if="n.state === 'done' && n.stars" class="node-stars">{{ '★'.repeat(n.stars) }}</span>
        <span v-if="n.state === 'current'" class="node-ping"></span>
      </button>

      <!-- 终点：结算 -->
      <button v-if="allDone" class="node done finish"
              :style="{ left: '95.5%', top: '20%' }"
              @click="$emit('select', 'result')">
        <span class="node-core"><Icon name="star" :size="14" /></span>
        <span class="node-label">结算</span>
      </button>

      <!-- 未开放的未来场景 -->
      <div v-for="l in LOCKED_DEFS" :key="l.label" class="node locked future"
           :style="{ left: l.x + '%', top: l.y + '%' }">
        <span class="node-core"><Icon name="lock" :size="14" /></span>
        <span class="node-label">{{ l.label }}</span>
      </div>
    </div>

    <!-- ===== 进度条 ===== -->
    <div class="fqmap-progress">
      <div class="pg-track"><div class="pg-fill" :style="{ width: progressPct + '%' }"></div></div>
      <span class="pg-text">{{ doneCount }}/{{ nodes.length }} 关 · 最佳 {{ bestScore }} 分</span>
      <button class="pg-reset" title="清除本地进度记录" @click="$emit('reset')">重置进度</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "@/components/Icon.vue";

export type MapNodeKey =
  | "prologue" | "level1" | "level2" | "level3" | "level4" | "level5" | "level6" | "result";

const props = defineProps<{
  /** 各关完成星级（0=未完成） */
  stars: Record<string, number>;
  bestScore: number;
}>();

defineEmits<{ (e: "select", key: MapNodeKey): void; (e: "reset"): void }>();

/** 节点定义：x/y 为地图百分比坐标（沿波浪路径），no 为显示序号（序章=0） */
const NODE_DEFS: { key: MapNodeKey; label: string; x: number; y: number; no: number }[] = [
  { key: "prologue", label: "接单备勤", x: 8,  y: 62, no: 0 },
  { key: "level1",   label: "测前准备", x: 20, y: 38, no: 1 },
  { key: "level2",   label: "排气参数", x: 32, y: 60, no: 2 },
  { key: "level3",   label: "布点采样", x: 44, y: 34, no: 3 },
  { key: "level4",   label: "等速跟踪", x: 56, y: 58, no: 4 },
  { key: "level5",   label: "称量判定", x: 68, y: 32, no: 5 },
  { key: "level6",   label: "质控报告", x: 80, y: 56, no: 6 },
];

/** 未开放的未来场景（装饰节点） */
const LOCKED_DEFS = [
  { label: "LDAR猎手", x: 90, y: 30 },
  { label: "水质追踪", x: 95, y: 58 },
];

const UNLOCK_ORDER: MapNodeKey[] = ["prologue", "level1", "level2", "level3", "level4", "level5", "level6"];

const nodes = computed(() => {
  // 解锁逻辑：第 1 关永远解锁；第 n 关需前 n-1 关拿到 ≥1 星
  let unlockedUpTo = 0;
  for (let i = 0; i < UNLOCK_ORDER.length; i++) {
    if ((props.stars[UNLOCK_ORDER[i]] ?? 0) >= 1) unlockedUpTo = i + 1;
    else break;
  }

  return NODE_DEFS.map((d, i) => {
    const st = (props.stars[d.key] ?? 0) >= 1 ? "done" : i === unlockedUpTo ? "current" : "locked";
    return { ...d, state: st as "done" | "current" | "locked", stars: props.stars[d.key] ?? 0 };
  });
});

const doneCount = computed(() => nodes.value.filter((n) => n.state === "done").length);
const allDone = computed(() => doneCount.value === NODE_DEFS.length);
const progressPct = computed(() => Math.round((doneCount.value / NODE_DEFS.length) * 100));
</script>

<style scoped>
.fqmap {
  background: rgba(13, 20, 34, 0.88);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(120, 150, 210, 0.25);
  border-radius: 18px;
  padding: 18px 20px 20px;
  color: #e2e8f0;
}

/* 头部 */
.fqmap-head { margin-bottom: 12px; }
.fqmap-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.fqmap-badge {
  font-size: 11px; letter-spacing: 2px; font-weight: 700;
  color: #fbbf24; background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.4);
  padding: 3px 10px; border-radius: 999px;
}
.fqmap-title h3 { margin: 0; font-size: 16px; color: #f1f5f9; }
.fqmap-sub { margin: 6px 0 0; font-size: 12.5px; color: #64748b; }

/* 地图画布 */
.fqmap-canvas {
  position: relative; height: 240px;
  border-radius: 14px; overflow: hidden;
  background:
    radial-gradient(ellipse at 75% 8%, rgba(253, 224, 71, 0.10), transparent 42%),
    linear-gradient(180deg, #23355c 0%, #1a2a4c 46%, #16223d 62%, #121c33 100%);
  border: 1px solid rgba(100, 116, 139, 0.3);
}

/* 电厂剪影 */
.map-plant { position: absolute; bottom: 18%; left: 0; right: 0; height: 34%; pointer-events: none; opacity: 0.5; }
.mp-stack { position: absolute; bottom: 12px; left: 8%; width: 16px; height: 74%; background: #2c3c5e; border-radius: 2px; }
.mp-stack.s2 { left: 15%; height: 48%; }
.mp-stack::after { content: ""; position: absolute; top: -10px; left: 4px; width: 8px; height: 10px; background: #33456a; }
.mp-boiler { position: absolute; bottom: 12px; right: 14%; width: 40px; height: 36%; background: #2c3c5e; border-radius: 3px; }
.mp-ground { position: absolute; bottom: 0; left: 0; right: 0; height: 12px; background: #1c2a48; }
.smoke { position: absolute; top: -8px; left: 4px; width: 7px; height: 7px; border-radius: 50%; background: rgba(148, 163, 184, 0.4); animation: puff 3.4s ease-out infinite; }
@keyframes puff { from { transform: translateY(0) scale(0.7); opacity: 0.6; } to { transform: translateY(-26px) scale(1.7); opacity: 0; } }
.map-road {
  position: absolute; bottom: 15%; left: 0; right: 0; height: 5px;
  background: repeating-linear-gradient(90deg, #3b4f78 0 16px, transparent 16px 26px);
  opacity: 0.55; border-radius: 3px;
}

/* 路径连线 */
.map-path { position: absolute; inset: 0; width: 100%; height: 100%; }
.path-line { animation: dashmove 3.2s linear infinite; }
@keyframes dashmove { to { stroke-dashoffset: -8; } }

/* 节点 */
.node {
  position: absolute; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: none; border: none; cursor: pointer; z-index: 3;
}
.node:disabled { cursor: not-allowed; }
.node.future { opacity: 0.55; z-index: 2; }
.node.future .node-core { background: #2a3650; border-color: rgba(100, 116, 139, 0.35); box-shadow: none; color: #52607d; }
.node-core {
  position: relative; display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 50%;
  font-size: 14px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, #2563eb, #06b6d4);
  border: 2.5px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 3px 12px rgba(37, 99, 235, 0.45);
  transition: transform 0.18s, box-shadow 0.18s;
}
.node.done .node-core { background: linear-gradient(135deg, #059669, #10b981); box-shadow: 0 3px 12px rgba(16, 185, 129, 0.4); }
.node.locked .node-core { background: #334155; border-color: rgba(148, 163, 184, 0.4); box-shadow: none; color: #64748b; }
.node.current .node-core { animation: pulse 1.6s ease-in-out infinite; }
.node:not(:disabled):hover .node-core { transform: scale(1.12); }
@keyframes pulse {
  0%, 100% { box-shadow: 0 3px 12px rgba(37, 99, 235, 0.45), 0 0 0 0 rgba(96, 165, 250, 0.5); }
  50% { box-shadow: 0 3px 12px rgba(37, 99, 235, 0.45), 0 0 0 9px rgba(96, 165, 250, 0); }
}
.node-label {
  font-size: 11px; font-weight: 600; color: #cbd5e1; white-space: nowrap;
  background: rgba(10, 16, 28, 0.65); padding: 2px 7px; border-radius: 6px;
}
.node.locked .node-label { color: #475569; }
.node-stars { position: absolute; top: -13px; font-size: 10px; color: #fbbf24; letter-spacing: 1px; }
.node-ping {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 36px; height: 36px; border-radius: 50%;
  border: 2px solid rgba(96, 165, 250, 0.6);
  animation: ping 1.6s ease-out infinite; pointer-events: none;
}
@keyframes ping { from { transform: translateX(-50%) scale(1); opacity: 0.8; } to { transform: translateX(-50%) scale(1.9); opacity: 0; } }

/* 进度条 */
.fqmap-progress { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.pg-track { flex: 1; height: 7px; border-radius: 4px; background: rgba(51, 65, 85, 0.7); overflow: hidden; }
.pg-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #2563eb, #06b6d4); transition: width 0.5s ease; }
.pg-text { font-size: 12px; color: #94a3b8; white-space: nowrap; }
.pg-reset {
  font-size: 11.5px; color: #64748b; background: none;
  border: 1px solid rgba(100, 116, 139, 0.35); border-radius: 999px;
  padding: 3px 10px; cursor: pointer; transition: all 0.18s;
}
.pg-reset:hover { color: #f87171; border-color: rgba(248, 113, 113, 0.5); }

/* 移动端 */
@media (max-width: 640px) {
  .fqmap-canvas { height: 200px; }
  .node-core { width: 30px; height: 30px; font-size: 12px; }
  .node-label { font-size: 10px; }
}
</style>
