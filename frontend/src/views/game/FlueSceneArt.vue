<template>
  <div class="fsa" :class="`fsa-${scene}`">
    <!-- 真实插画背景层（AI 生成，覆盖 CSS 场景底色） -->
    <div v-if="bgImage" class="fsa-photo" :style="{ backgroundImage: `url(${bgImage})` }"></div>
    <div v-if="bgImage" class="fsa-photo-veil"></div>
    <!-- ===== 电厂办公室（剧情·接单） ===== -->
    <div v-if="scene === 'office'" class="fsa-scene">
      <div class="sky">
        <div class="sun"></div>
        <div class="cloud c1"></div>
        <div class="cloud c2"></div>
      </div>
      <!-- 窗外电厂剪影 -->
      <div class="window">
        <div class="win-plant">
          <div class="w-stack"><i class="smoke s1"></i><i class="smoke s2"></i></div>
          <div class="w-stack low"></div>
          <div class="w-boiler"></div>
        </div>
      </div>
      <!-- 办公桌 + 人物 -->
      <div class="desk"></div>
      <div class="phone"></div>
      <div class="person hero">
        <div class="head"><i class="hair"></i><i class="eye"></i></div>
        <div class="body"></div>
        <div class="arm up"></div>
        <div class="arm dn"></div>
      </div>
      <div class="caption"><slot /></div>
    </div>

    <!-- ===== 45m 平台（剧情·爬塔/安全） ===== -->
    <div v-if="scene === 'platform'" class="fsa-scene">
      <div class="sky dawn">
        <div class="sun low-sun"></div>
        <div class="cloud c1"></div>
      </div>
      <!-- 大烟囱主体 -->
      <div class="chimney">
        <div class="band b1"></div><div class="band b2"></div>
        <div class="porthole"></div>
      </div>
      <!-- 栏杆平台 -->
      <div class="catwalk">
        <i v-for="n in 8" :key="n" class="rail" :style="{ left: n * 11 + '%' }"></i>
      </div>
      <!-- 人物：戴安全帽系安全带 -->
      <div class="person hero climb">
        <div class="head"><i class="helmet"></i><i class="eye"></i></div>
        <div class="body"></div>
        <div class="rope"></div>
        <div class="arm up"></div>
        <div class="arm dn"></div>
      </div>
      <div class="caption"><slot /></div>
    </div>

    <!-- ===== 采样孔开孔处（剧情·测参数） ===== -->
    <div v-if="scene === 'port'" class="fsa-scene">
      <div class="duct-h">
        <i class="flange f1"></i><i class="flange f2"></i>
        <div class="port"><i class="heat"></i><i class="heat h2"></i><i class="heat h3"></i></div>
      </div>
      <!-- 人物：持测温枪 -->
      <div class="person hero probe">
        <div class="head"><i class="helmet y"></i><i class="eye"></i></div>
        <div class="body"></div>
        <div class="gun"></div>
        <div class="arm up"></div>
        <div class="arm dn"></div>
      </div>
      <!-- 参数浮牌 -->
      <div class="float-tag t1">T = 96℃</div>
      <div class="float-tag t2">Δp 动压</div>
      <div class="float-tag t3">Xsw = 6.5%</div>
      <div class="caption"><slot /></div>
    </div>

    <!-- ===== 关1 · 断面布点（烟道断面图） ===== -->
    <div v-if="scene === 'level1'" class="fsa-scene">
      <div class="duct-ring">
        <i v-for="n in 3" :key="n" class="ring" :style="{ transform: 'scale(' + (n * 0.32) + ')' }"></i>
        <i class="cross-h"></i><i class="cross-v"></i>
        <i v-for="(p, i) in ringDots" :key="'d' + i" class="dot" :style="{ left: p.x + '%', top: p.y + '%' }"></i>
      </div>
      <div class="person mini left">
        <div class="head"><i class="helmet"></i></div>
        <div class="body"></div>
      </div>
      <div class="caption"><slot /></div>
    </div>

    <!-- ===== 关2 · 装备选择（器材墙） ===== -->
    <div v-if="scene === 'level2'" class="fsa-scene">
      <div class="gear-wall">
        <div class="nozzle"><i class="nz-tip"></i></div>
        <div class="filter"></div>
        <div class="hose"><i class="hz-coil"></i></div>
        <div class="suctor"></div>
      </div>
      <div class="person mini right">
        <div class="head"><i class="helmet y"></i></div>
        <div class="body"></div>
      </div>
      <div class="caption"><slot /></div>
    </div>

    <!-- ===== 关3 · 等速采样（烟气流线） ===== -->
    <div v-if="scene === 'level3'" class="fsa-scene">
      <div class="flow-duct">
        <i v-for="n in 5" :key="n" class="stream" :style="{ animationDelay: n * 0.35 + 's', top: 18 + n * 13 + '%' }"></i>
        <div class="probe-in"></div>
      </div>
      <div class="person mini left">
        <div class="head"><i class="helmet"></i></div>
        <div class="body"></div>
        <div class="gauge-hold"></div>
      </div>
      <div class="caption"><slot /></div>
    </div>

    <!-- ===== 未开放（锁定剪影） ===== -->
    <div v-if="scene === 'locked'" class="fsa-scene">
      <div class="lock-wall">
        <div class="lock-body"><i class="lock-hole"></i></div>
        <div class="fog"></div>
      </div>
      <div class="caption"><slot /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import sceneOffice from "@/assets/game/scene-office.webp";
import scenePlatform from "@/assets/game/scene-platform.webp";
import sceneDuct from "@/assets/game/scene-duct.webp";
import sceneFlow from "@/assets/game/scene-flow.webp";
import scenePlant from "@/assets/game/scene-plant.webp";

const props = defineProps<{ scene: string }>();

/** 场景 → AI 插画背景映射（office/platform/level1/level2/level3/port） */
const BG_MAP: Record<string, string> = {
  office: sceneOffice,
  platform: scenePlatform,
  port: sceneDuct,
  level1: sceneDuct,
  level2: scenePlant,
  level3: sceneFlow,
};
const bgImage = computed(() => BG_MAP[props.scene] || "");

/** 关1 断面测点示意（3环×2孔示意点位） */
const ringDots = computed(() => {
  const pts: { x: number; y: number }[] = [];
  const coeffs = [0.146, 0.5, 0.854];
  for (const a of [0, Math.PI / 2]) {
    for (const c of coeffs) {
      const t = (2 * c - 1) * 36;
      pts.push({ x: 50 + t * Math.cos(a), y: 50 + t * Math.sin(a) });
    }
  }
  return pts;
});
</script>

<style scoped>
.fsa {
  position: relative;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(180deg, #1b2a4a 0%, #16223d 60%, #121c33 100%);
  border: 1px solid rgba(120, 150, 210, 0.22);
  min-height: 190px;
}

/* ===== AI 插画背景层 ===== */
.fsa-photo {
  position: absolute; inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.92;
}
.fsa-photo-veil {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(13, 20, 34, 0.18) 0%, rgba(13, 20, 34, 0.08) 45%, rgba(10, 16, 28, 0.72) 100%);
  pointer-events: none;
}
/* 有插画时场景 CSS 元素压暗作点缀 */
.fsa-photo ~ .fsa-scene { opacity: 0.28; mix-blend-mode: luminosity; }
.fsa-photo ~ .caption { z-index: 6; }

/* ===== 通用人物 ===== */
.person { position: absolute; bottom: 12%; width: 34px; height: 74px; z-index: 5; }
.person .head {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 18px; height: 18px; border-radius: 50%;
  background: #f3c99b;
}
.person .head .hair { position: absolute; top: -2px; left: -1px; right: -1px; height: 9px; border-radius: 9px 9px 0 0; background: #2c2c34; }
.person .head .helmet { position: absolute; top: -5px; left: -3px; right: -3px; height: 11px; border-radius: 10px 10px 3px 3px; background: #f59e0b; box-shadow: 0 2px 4px rgba(0,0,0,.3); }
.person .head .helmet.y { background: #fde047; }
.person .head .eye { position: absolute; bottom: 5px; right: 2px; width: 3px; height: 3px; border-radius: 50%; background: #1e293b; }
.person .body {
  position: absolute; top: 17px; left: 50%; transform: translateX(-50%);
  width: 22px; height: 34px; border-radius: 8px 8px 5px 5px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  box-shadow: inset 0 3px 0 rgba(255,255,255,.18);
}
.person .arm { position: absolute; top: 20px; width: 7px; height: 26px; border-radius: 4px; background: #3b82f6; }
.person .arm.up { left: -4px; transform: rotate(28deg); transform-origin: top center; }
.person .arm.dn { right: -4px; transform: rotate(-24deg); transform-origin: top center; }
.person.mini { height: 52px; width: 26px; }
.person.mini .body { top: 13px; width: 17px; height: 26px; }
.person.mini .head { width: 14px; height: 14px; }

/* ===== 场景通用：说明文字 ===== */
.caption {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 26px 16px 10px;
  background: linear-gradient(180deg, transparent, rgba(10, 16, 28, 0.85));
  color: #cbd5e1; font-size: 13px; line-height: 1.6;
  pointer-events: none;
}

/* ===== office 办公室 ===== */
.sky { position: absolute; inset: 0 0 30% 0; }
.sun { position: absolute; top: 16%; right: 18%; width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(circle, #fde68a, #f59e0b); box-shadow: 0 0 26px rgba(245, 158, 11, 0.5); }
.cloud { position: absolute; width: 56px; height: 14px; border-radius: 12px; background: rgba(255,255,255,.14); }
.cloud.c1 { top: 24%; left: 12%; animation: drift 22s linear infinite; }
.cloud.c2 { top: 14%; left: 46%; width: 40px; animation: drift 30s linear infinite reverse; }
@keyframes drift { from { transform: translateX(-30px); } to { transform: translateX(420px); } }
.window {
  position: absolute; left: 10%; top: 10%; width: 44%; height: 58%;
  border: 3px solid #334766; border-radius: 8px;
  background: linear-gradient(180deg, #24365c, #1a2a4c);
  overflow: hidden;
}
.win-plant { position: absolute; bottom: 8px; left: 0; right: 0; height: 46px; }
.w-stack { position: absolute; bottom: 14px; left: 22%; width: 14px; height: 32px; background: #46587e; border-radius: 2px; }
.w-stack.low { left: 40%; height: 20px; }
.w-stack::after { content: ""; position: absolute; top: -12px; left: 3px; width: 8px; height: 12px; background: #566d96; }
.w-boiler { position: absolute; bottom: 14px; right: 12%; width: 26px; height: 22px; background: #3c4f74; border-radius: 3px; }
.smoke { position: absolute; top: -10px; left: 4px; width: 8px; height: 8px; border-radius: 50%; background: rgba(203, 213, 225, 0.35); animation: puff 3.2s ease-out infinite; }
.smoke.s2 { animation-delay: 1.6s; }
@keyframes puff { from { transform: translateY(0) scale(0.7); opacity: 0.7; } to { transform: translateY(-30px) scale(1.6); opacity: 0; } }
.desk { position: absolute; bottom: 10%; left: 34%; right: 8%; height: 12px; background: #6b4f35; border-radius: 3px; box-shadow: 0 4px 0 #57402a; }
.phone { position: absolute; bottom: calc(10% + 12px); left: 66%; width: 16px; height: 9px; background: #1f2937; border-radius: 2px; animation: ring 1.2s ease-in-out infinite; }
@keyframes ring { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-8deg); } 75% { transform: rotate(8deg); } }
.person.hero { left: 16%; }

/* ===== platform 平台 ===== */
.sky.dawn { background: linear-gradient(180deg, #33436e 0%, transparent 70%); }
.low-sun { top: 30%; right: 12%; width: 28px; height: 28px; opacity: 0.8; }
.chimney {
  position: absolute; bottom: 34%; left: 50%; transform: translateX(-50%);
  width: 84px; height: 62%;
  background: linear-gradient(90deg, #4a5d85 0%, #5d729c 45%, #3d4f78 100%);
  border-radius: 6px 6px 0 0;
}
.band { position: absolute; left: -4px; right: -4px; height: 7px; background: #f87171; opacity: 0.75; border-radius: 2px; }
.band.b1 { top: 22%; } .band.b2 { top: 46%; }
.porthole { position: absolute; top: 60%; left: 50%; transform: translateX(-50%); width: 14px; height: 14px; border-radius: 50%; background: #0f172a; border: 3px solid #2c3c5e; }
.catwalk {
  position: absolute; bottom: 30%; left: 4%; right: 4%; height: 6px;
  background: #55688f; border-radius: 2px;
  border-top: 3px solid #6b81ad;
}
.catwalk .rail { position: absolute; top: -22px; width: 3px; height: 22px; background: #6b81ad; }
.person.hero.climb { left: 62%; bottom: calc(30% + 6px); }
.rope { position: absolute; top: 22px; left: 50%; width: 2px; height: 30px; background: #fbbf24; transform: rotate(14deg); }

/* ===== port 采样孔 ===== */
.duct-h {
  position: absolute; top: 34%; left: 6%; right: 6%; height: 74px;
  background: linear-gradient(180deg, #4d6288, #3a4d74);
  border-radius: 10px;
  box-shadow: inset 0 4px 0 rgba(255,255,255,.12), inset 0 -5px 0 rgba(0,0,0,.22);
}
.flange { position: absolute; top: -6px; bottom: -6px; width: 10px; background: #2c3c5e; border-radius: 3px; }
.flange.f1 { left: 16%; } .flange.f2 { right: 16%; }
.port {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 26px; height: 26px; border-radius: 50%;
  background: #101a2c; border: 4px solid #6b81ad;
}
.heat { position: absolute; top: -14px; left: 8px; width: 5px; height: 12px; border-radius: 3px; background: rgba(251, 146, 60, 0.75); animation: wobble 1.4s ease-in-out infinite; }
.heat.h2 { left: 20px; animation-delay: 0.4s; }
.heat.h3 { left: 32px; animation-delay: 0.8s; }
@keyframes wobble { 0%, 100% { transform: scaleY(1); opacity: 0.75; } 50% { transform: scaleY(1.5); opacity: 0.4; } }
.person.hero.probe { left: 20%; bottom: 8%; }
.gun { position: absolute; top: 24px; right: -16px; width: 22px; height: 6px; background: #94a3b8; border-radius: 3px; }
.float-tag {
  position: absolute; padding: 3px 9px; border-radius: 8px; font-size: 11px; font-weight: 600;
  background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(96, 165, 250, 0.45); color: #93c5fd;
  animation: bob 2.6s ease-in-out infinite;
}
.float-tag.t1 { top: 14%; left: 12%; }
.float-tag.t2 { top: 10%; left: 44%; animation-delay: 0.6s; }
.float-tag.t3 { top: 16%; right: 10%; animation-delay: 1.2s; }
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }

/* ===== level1 断面 ===== */
.duct-ring {
  position: absolute; top: 50%; left: 44%; transform: translate(-50%, -50%);
  width: 150px; height: 150px; border-radius: 50%;
  background: radial-gradient(circle, #1c2942 0%, #14203a 100%);
  border: 5px solid #3d4f78;
}
.ring { position: absolute; inset: 0; margin: auto; width: 100%; height: 100%; border-radius: 50%; border: 1.5px dashed rgba(120, 150, 210, 0.4); }
.cross-h { position: absolute; top: 50%; left: 4%; right: 4%; height: 1.5px; background: rgba(96, 165, 250, 0.35); }
.cross-v { position: absolute; left: 50%; top: 4%; bottom: 4%; width: 1.5px; background: rgba(96, 165, 250, 0.35); }
.dot {
  position: absolute; width: 9px; height: 9px; border-radius: 50%; margin: -4px 0 0 -4px;
  background: #fbbf24; box-shadow: 0 0 8px rgba(251, 191, 36, 0.7);
  animation: blink 2s ease-in-out infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.person.mini.left { left: 10%; bottom: 16%; }

/* ===== level2 器材墙 ===== */
.gear-wall {
  position: absolute; top: 16%; bottom: 30%; left: 16%; right: 16%;
  background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(100, 116, 139, 0.35); border-radius: 12px;
  display: flex; align-items: center; justify-content: space-evenly;
}
.nozzle { position: relative; width: 34px; height: 12px; background: linear-gradient(90deg, #94a3b8, #64748b); border-radius: 3px 8px 8px 3px; }
.nz-tip { position: absolute; right: -9px; top: 2px; width: 9px; height: 8px; background: #cbd5e1; clip-path: polygon(0 0, 100% 50%, 0 100%); }
.filter { width: 30px; height: 40px; border-radius: 6px; background: linear-gradient(135deg, #a16207, #854d0e); box-shadow: inset 0 0 0 3px #ca8a04; }
.hose { position: relative; width: 40px; height: 40px; border-radius: 50%; border: 6px solid #0ea5e9; border-top-color: transparent; transform: rotate(35deg); }
.hz-coil { position: absolute; top: -6px; left: -6px; width: 10px; height: 10px; border-radius: 50%; background: #0ea5e9; }
.suctor { width: 10px; height: 52px; background: linear-gradient(180deg, #64748b, #475569); border-radius: 5px; }
.person.mini.right { right: 8%; bottom: 12%; }

/* ===== level3 流线 ===== */
.flow-duct {
  position: absolute; top: 18%; bottom: 26%; left: 8%; right: 8%;
  background: linear-gradient(90deg, #1c2a48, #24365c 55%, #1c2a48);
  border-radius: 12px; overflow: hidden;
  border: 1px solid rgba(100, 116, 139, 0.4);
}
.stream {
  position: absolute; left: -12%; width: 34%; height: 3px; border-radius: 3px;
  background: linear-gradient(90deg, transparent, #34d399);
  animation: flow 2.6s linear infinite;
}
@keyframes flow { from { left: -14%; opacity: 0; } 15% { opacity: 0.9; } to { left: 108%; opacity: 0; } }
.probe-in { position: absolute; top: 50%; right: -4px; transform: translateY(-50%); width: 60px; height: 8px; background: linear-gradient(90deg, #64748b, #94a3b8); border-radius: 4px; }
.person.mini.left { left: 8%; bottom: 8%; }
.gauge-hold { position: absolute; top: 20px; right: -12px; width: 14px; height: 16px; border-radius: 3px; background: #0f172a; border: 2px solid #60a5fa; }

/* ===== locked ===== */
.lock-wall {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(59, 130, 246, 0.08), transparent 55%),
    repeating-linear-gradient(45deg, rgba(100, 116, 139, 0.06) 0 10px, transparent 10px 20px),
    linear-gradient(180deg, #16223d, #121c33);
}
.lock-body {
  position: absolute; top: 34%; left: 50%; transform: translateX(-50%);
  width: 44px; height: 34px; border-radius: 8px;
  background: linear-gradient(135deg, #64748b, #475569);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}
.lock-body::before {
  content: ""; position: absolute; top: -16px; left: 50%; transform: translateX(-50%);
  width: 24px; height: 20px; border: 5px solid #64748b; border-bottom: none;
  border-radius: 14px 14px 0 0;
}
.lock-hole { position: absolute; top: 13px; left: 50%; transform: translateX(-50%); width: 8px; height: 8px; border-radius: 50%; background: #1e293b; }
.fog { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 100%, rgba(15, 23, 42, 0.6), transparent 65%); }

/* 移动端 */
@media (max-width: 640px) {
  .fsa { min-height: 160px; }
  .person { transform: scale(0.85); transform-origin: bottom left; }
  .duct-ring { width: 120px; height: 120px; }
  .caption { font-size: 12px; }
}
</style>
