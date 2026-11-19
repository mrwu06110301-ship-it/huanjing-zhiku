<script setup lang="ts">
/**
 * AnalogSignalConverter.vue — 模拟输出 ↔ 工程量转换器
 *
 * 信号类型预设 4–20mA / 0–20mA / 0–5V / 0–10V + 自定义（电流或电压），
 * 量程范围与工程单位全可自定义，双向换算（输入即算）：
 *   信号 S = sLow + (sHigh − sLow) × (PV − pLow) / (pHigh − pLow)
 *   工程量 PV = pLow + (S − sLow) / (sHigh − sLow) × (pHigh − pLow)
 * 附进度条、快捷百分点、对照速查表、公式实时显示。
 * 风格：暗色仪表盘（与其他计算工具统一）。
 */
import { ref, reactive, computed } from "vue";

/* ================= 信号类型 ================= */
const PRESETS: Record<string, { label: string; low: number; high: number; unit: string }> = {
  "420": { label: "4–20 mA", low: 4, high: 20, unit: "mA" },
  "020": { label: "0–20 mA", low: 0, high: 20, unit: "mA" },
  "05": { label: "0–5 V", low: 0, high: 5, unit: "V" },
  "010": { label: "0–10 V", low: 0, high: 10, unit: "V" },
};
const type = ref<string>("420");

/* ================= 自定义信号（仅 custom 时显示） ================= */
const customSig = reactive({ low: "4", high: "20", unit: "mA" });

/* ================= 量程（工程量） ================= */
const range = reactive({ low: "0", high: "100", unit: "mg/m³" });

/* ================= 主输入（双向） ================= */
const pvInput = ref("");
const sigInput = ref("");
/** 最后编辑侧 */
const activeSide = ref<"pv" | "sig">("pv");

/* ================= 消息 ================= */
const msg = ref<{ text: string; cls: string }>({ text: "", cls: "" });

function num(v: string): number | null {
  const t = v.trim();
  if (t === "" || t === "-" || t === ".") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
function fmt(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return "—";
  const r = Math.round(x * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

/* ================= 配置（计算用） ================= */
const cfg = computed(() => {
  let sLow: number | null, sHigh: number | null, sUnit: string;
  if (type.value === "custom") {
    sLow = num(customSig.low);
    sHigh = num(customSig.high);
    sUnit = customSig.unit.trim() || "mA";
  } else {
    const p = PRESETS[type.value];
    sLow = p.low; sHigh = p.high; sUnit = p.unit;
  }
  const pLow = num(range.low), pHigh = num(range.high);
  const pUnit = range.unit.trim();
  return {
    sLow, sHigh, sUnit, pLow, pHigh, pUnit,
    valid: sLow !== null && sHigh !== null && sHigh > sLow &&
           pLow !== null && pHigh !== null && pHigh > pLow,
  };
});

/* ================= 换算核心 ================= */
function pvToSig(pv: number) {
  const c = cfg.value;
  return c.sLow! + (c.sHigh! - c.sLow!) * (pv - c.pLow!) / (c.pHigh! - c.pLow!);
}
function sigToPv(sig: number) {
  const c = cfg.value;
  return c.pLow! + (sig - c.sLow!) / (c.sHigh! - c.sLow!) * (c.pHigh! - c.pLow!);
}

/* ================= 双向换算 ================= */
function fromPV() {
  const c = cfg.value;
  if (!c.valid) { msg.value = { text: "配置无效：上限须大于下限", cls: "err" }; return; }
  const raw = pvInput.value.trim();
  if (raw === "" || raw === "-") {
    sigInput.value = raw === "-" ? raw : "";
    msg.value = { text: "", cls: "" };
    return;
  }
  const pv = parseFloat(raw);
  if (!Number.isFinite(pv)) { msg.value = { text: "无效数字", cls: "err" }; return; }
  activeSide.value = "pv";
  const sig = pvToSig(pv);
  sigInput.value = fmt(sig);
  if (pv < c.pLow!) {
    msg.value = { text: `低于量程下限（${fmt(c.pLow!)}）：外推信号 ${fmt(sig)} ${c.sUnit}`, cls: "warn" };
  } else if (pv > c.pHigh!) {
    msg.value = { text: `超出量程上限（${fmt(c.pHigh!)}）：外推信号 ${fmt(sig)} ${c.sUnit}`, cls: "warn" };
  } else {
    msg.value = { text: `OK · ${fmt(pv)} ${c.pUnit} → ${fmt(sig)} ${c.sUnit}`, cls: "ok" };
  }
}

function fromSIG() {
  const c = cfg.value;
  if (!c.valid) { msg.value = { text: "配置无效：上限须大于下限", cls: "err" }; return; }
  const raw = sigInput.value.trim();
  if (raw === "" || raw === "-") {
    pvInput.value = raw === "-" ? raw : "";
    msg.value = { text: "", cls: "" };
    return;
  }
  const sig = parseFloat(raw);
  if (!Number.isFinite(sig)) { msg.value = { text: "无效数字", cls: "err" }; return; }
  activeSide.value = "sig";
  const pv = sigToPv(sig);
  pvInput.value = fmt(pv);
  if (sig < c.sLow!) {
    if (sig <= 0) {
      msg.value = { text: `故障区：≤ 0 ${c.sUnit}，非有效模拟信号`, cls: "err" };
    } else if (c.sLow! > 0) {
      msg.value = { text: `低于活零点（< ${fmt(c.sLow!)} ${c.sUnit}）：按外推理解为 ${fmt(pv)} ${c.pUnit}`, cls: "warn" };
    } else {
      msg.value = { text: `低于信号下限：按外推理解为 ${fmt(pv)} ${c.pUnit}`, cls: "warn" };
    }
  } else if (sig > c.sHigh!) {
    msg.value = { text: `超量程（> ${fmt(c.sHigh!)} ${c.sUnit}）：外推至 ${fmt(pv)} ${c.pUnit}`, cls: "warn" };
  } else {
    msg.value = { text: `OK · ${fmt(sig)} ${c.sUnit} → ${fmt(pv)} ${c.pUnit}`, cls: "ok" };
  }
}

/** 配置变化后按最后编辑侧重算 */
function recalc() {
  if (activeSide.value === "sig") fromSIG();
  else fromPV();
}

/* ================= 进度条 ================= */
const fillPct = computed(() => {
  const c = cfg.value;
  if (!c.valid || pvInput.value.trim() === "" && sigInput.value.trim() === "") return 0;
  const frac = activeSide.value === "sig"
    ? (num(sigInput.value)! - c.sLow!) / (c.sHigh! - c.sLow!)
    : (num(pvInput.value)! - c.pLow!) / (c.pHigh! - c.pLow!);
  if (!Number.isFinite(frac)) return 0;
  return Math.max(0, Math.min(100, frac * 100));
});

/* ================= 快捷按钮 / 速查表 / 公式 ================= */
const quickBtns = computed(() => {
  const c = cfg.value;
  if (!c.valid) return [];
  return [0, 25, 50, 75, 100].map((p) => ({
    pct: p,
    pv: c.pLow! + (c.pHigh! - c.pLow!) * p / 100,
  }));
});

const refRows = computed(() => {
  const c = cfg.value;
  if (!c.valid) return [];
  return [0, 20, 40, 60, 80, 100].map((p) => {
    const pv = c.pLow! + (c.pHigh! - c.pLow!) * p / 100;
    return { pv, sig: pvToSig(pv), pct: p };
  });
});

const formulaLines = computed(() => {
  const c = cfg.value;
  if (!c.valid) return [];
  const sSym = c.sUnit === "mA" ? "I" : "U";
  return [
    `${sSym} = ${fmt(c.sLow!)} + ${fmt(c.sHigh! - c.sLow!)} × (PV − ${fmt(c.pLow!)}) / ${fmt(c.pHigh! - c.pLow!)}`,
    `PV = ${fmt(c.pLow!)} + (${sSym} − ${fmt(c.sLow!)}) / ${fmt(c.sHigh! - c.sLow!)} × ${fmt(c.pHigh! - c.pLow!)}`,
  ];
});

const footInfo = computed(() => {
  const c = cfg.value;
  if (!c.valid) return null;
  const res = (c.pHigh! - c.pLow!) / (c.sHigh! - c.sLow!);
  return {
    span: `Span：${fmt(c.sHigh! - c.sLow!)} ${c.sUnit} / ${fmt(c.pLow!)}–${fmt(c.pHigh!)} ${c.pUnit}`,
    res: `1 ${c.sUnit} = ${fmt(res)} ${c.pUnit}`,
  };
});

/* ================= 操作 ================= */
function pickPV(pv: number) {
  pvInput.value = fmt(pv);
  activeSide.value = "pv";
  fromPV();
}
function clearAll() {
  pvInput.value = "";
  sigInput.value = "";
  msg.value = { text: "", cls: "" };
}
function onPVInput(e: Event) {
  const el = e.target as HTMLInputElement;
  pvInput.value = el.value;
  fromPV();
}
function onSIGInput(e: Event) {
  const el = e.target as HTMLInputElement;
  sigInput.value = el.value;
  fromSIG();
}
</script>

<template>
  <div class="ac-tool">
    <!-- ===== 信号类型 ===== -->
    <section class="panel">
      <div class="cfg-h">
        <span class="cfg-t">信号类型</span>
        <span class="cfg-en">Signal Type</span>
      </div>
      <div class="seg">
        <button
          v-for="(p, k) in PRESETS"
          :key="k"
          :class="['seg-btn', { active: type === k }]"
          @click="type = k"
        >{{ p.label }}</button>
        <button :class="['seg-btn', { active: type === 'custom' }]" @click="type = 'custom'">自定义</button>
      </div>

      <!-- 自定义信号范围 -->
      <div v-if="type === 'custom'" class="cfg-row">
        <div class="cf">
          <label>信号下限</label>
          <div class="wrap"><input v-model="customSig.low" inputmode="decimal" @input="recalc"></div>
        </div>
        <div class="cf">
          <label>信号上限</label>
          <div class="wrap"><input v-model="customSig.high" inputmode="decimal" @input="recalc"></div>
        </div>
        <div class="cf">
          <label>信号单位</label>
          <div class="wrap"><input v-model="customSig.unit" @input="recalc"></div>
        </div>
      </div>
    </section>

    <!-- ===== 量程 + 换算 ===== -->
    <section class="panel">
      <div class="cfg-h">
        <span class="cfg-t">量程范围（工程量）</span>
        <span class="cfg-en">Engineering Range</span>
      </div>
      <div class="cfg-row">
        <div class="cf">
          <label>量程下限</label>
          <div class="wrap"><input v-model="range.low" inputmode="decimal" @input="recalc"></div>
        </div>
        <div class="cf">
          <label>量程上限</label>
          <div class="wrap"><input v-model="range.high" inputmode="decimal" @input="recalc"></div>
        </div>
        <div class="cf">
          <label>工程单位</label>
          <div class="wrap"><input v-model="range.unit" @input="recalc"></div>
        </div>
      </div>

      <!-- 主换算区 -->
      <div class="exch">
        <div class="field">
          <label><span>工程量</span><b>输入 / 输出</b></label>
          <div class="wrap main-wrap">
            <input
              class="inp"
              inputmode="decimal"
              autocomplete="off"
              :value="pvInput"
              placeholder="输入工程量…"
              @input="onPVInput"
            >
            <span class="unit">{{ cfg.valid ? cfg.pUnit || "—" : "—" }}</span>
          </div>
        </div>

        <div class="arrow">⇅</div>

        <div class="field">
          <label><span>模拟信号</span><b>输入 / 输出</b></label>
          <div class="wrap main-wrap">
            <input
              class="inp"
              inputmode="decimal"
              autocomplete="off"
              :value="sigInput"
              placeholder="输入电流或电压…"
              @input="onSIGInput"
            >
            <span class="unit">{{ cfg.sUnit }}</span>
          </div>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="scale">
        <div class="bar"><div class="fill" :style="{ width: fillPct + '%' }"></div></div>
        <div class="ticks" v-if="cfg.valid">
          <span>{{ fmt(cfg.sLow!) }} {{ cfg.sUnit }} · {{ fmt(cfg.pLow!) }}</span>
          <span>{{ fmt((cfg.sLow! + cfg.sHigh!) / 2) }} {{ cfg.sUnit }} · {{ fmt((cfg.pLow! + cfg.pHigh!) / 2) }}</span>
          <span>{{ fmt(cfg.sHigh!) }} {{ cfg.sUnit }} · {{ fmt(cfg.pHigh!) }}</span>
        </div>
        <div class="ticks" v-else><span>—</span><span>—</span><span>—</span></div>
      </div>

      <!-- 快捷按钮 -->
      <div class="quick" v-if="quickBtns.length">
        <button v-for="q in quickBtns" :key="q.pct" @click="pickPV(q.pv)">
          {{ q.pct }}%<b>{{ fmt(q.pv) }}</b>
        </button>
      </div>

      <!-- 消息 -->
      <div :class="['msg', msg.cls]" v-if="msg.text">{{ msg.text }}</div>

      <button class="clearbtn" @click="clearAll">清空全部</button>
    </section>

    <!-- ===== 速查表 ===== -->
    <section class="panel">
      <div class="cfg-h">
        <span class="cfg-t">对照速查表</span>
        <span class="cfg-en">点击行载入</span>
      </div>
      <table class="reftb" v-if="refRows.length">
        <thead>
          <tr><th>工程量</th><th>信号</th><th>量程</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in refRows" :key="r.pct" @click="pickPV(r.pv)">
            <td>{{ fmt(r.pv) }} {{ cfg.pUnit }}</td>
            <td class="sig">{{ fmt(r.sig) }} {{ cfg.sUnit }}</td>
            <td>{{ r.pct }}%</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-cfg">配置待完成：请设置有效的信号范围与量程范围</div>
    </section>

    <!-- ===== 公式 ===== -->
    <section class="panel">
      <div class="cfg-h"><span class="cfg-t">换算公式</span></div>
      <template v-if="formulaLines.length">
        <div class="fx-l" v-for="(l, i) in formulaLines" :key="i"><code>{{ l }}</code></div>
        <div class="foot" v-if="footInfo">
          <span>{{ footInfo.span }}</span>
          <span>{{ footInfo.res }}</span>
        </div>
      </template>
      <div v-else class="empty-cfg">请设置有效的信号范围与量程范围（上限须大于下限）</div>
    </section>
  </div>
</template>

<style scoped>
/* ================= 暗色仪表盘主题（与其他计算工具统一） ================= */
.ac-tool {
  --d-bg: #0f1419;
  --d-panel: #161d26;
  --d-panel2: #1c2530;
  --d-line: #2a3644;
  --d-txt: #e8edf2;
  --d-muted: #8b9bab;
  --d-dim: #54626f;
  --d-accent: #4fc3f7;
  --d-accent2: #66d9a8;
  --d-warn: #ffb454;
  --d-err: #ff6b6b;
  display: flex; flex-direction: column; gap: 16px;
  font-family: "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.panel {
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 16px;
  padding: 18px 22px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.28);
  color: var(--d-txt);
}

/* ---- 区头 ---- */
.cfg-h {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 12px;
}
.cfg-t {
  font-size: 11.5px; letter-spacing: 1px; text-transform: uppercase;
  color: var(--d-accent); font-weight: 600;
}
.cfg-en { font-size: 11px; color: var(--d-dim); }

/* ---- 信号类型分段按钮 ---- */
.seg { display: flex; gap: 8px; flex-wrap: wrap; }
.seg-btn {
  flex: 1; min-width: 84px;
  background: var(--d-panel2); border: 1px solid var(--d-line); color: var(--d-muted);
  border-radius: 9px; padding: 10px 8px; font-size: 13px; cursor: pointer;
  transition: all 0.15s; font-family: inherit; font-variant-numeric: tabular-nums;
}
.seg-btn:hover { border-color: var(--d-accent); color: var(--d-txt); }
.seg-btn.active {
  border-color: var(--d-accent); color: var(--d-accent);
  background: rgba(79, 195, 247, 0.08); font-weight: 600;
}

/* ---- 配置行 ---- */
.cfg-row {
  display: grid; grid-template-columns: 1.2fr 1.2fr 0.9fr; gap: 10px;
  margin-top: 14px;
}
.cf label {
  display: block; font-size: 10.5px; color: var(--d-dim);
  letter-spacing: 0.5px; margin-bottom: 5px; text-transform: uppercase;
}
.cf .wrap { display: flex; align-items: center; }
.cf input {
  background: transparent; border: none; outline: none; color: var(--d-txt);
  font-size: 15px; font-weight: 600; padding: 8px 8px 8px 11px; width: 100%;
  font-variant-numeric: tabular-nums;
}
.cf input::placeholder { color: #3f4b59; font-weight: 400; font-size: 12px; }

/* ---- 输入框通用 ---- */
.wrap {
  display: flex; align-items: center;
  background: var(--d-panel2);
  border: 1px solid var(--d-line);
  border-radius: 9px;
  transition: border-color 0.15s, box-shadow 0.15s;
  overflow: hidden;
}
.wrap:focus-within {
  border-color: var(--d-accent);
  box-shadow: 0 0 0 3px rgba(79, 195, 247, 0.12);
}
.inp {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: var(--d-txt);
  font-size: 24px; font-weight: 600;
  padding: 11px 8px 11px 15px;
  font-variant-numeric: tabular-nums;
  width: 100%;
}
.inp::placeholder { color: #3f4b59; font-weight: 400; font-size: 14px; }
.unit { color: var(--d-muted); font-size: 14px; padding-right: 14px; white-space: nowrap; }

/* ---- 主换算区 ---- */
.exch { margin-top: 18px; }
.field { margin-bottom: 4px; }
.field label {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 12px; color: var(--d-muted); margin-bottom: 7px;
  letter-spacing: 0.4px; text-transform: uppercase;
}
.field label b { color: var(--d-txt); font-size: 12.5px; letter-spacing: 0.2px; text-transform: none; }
.arrow {
  display: flex; justify-content: center; align-items: center;
  color: var(--d-accent); font-size: 20px; margin: 8px 0 12px; letter-spacing: 6px;
}

/* ---- 进度条 ---- */
.scale { margin: 18px 0 4px; }
.bar {
  position: relative; height: 10px; border-radius: 5px;
  background: linear-gradient(90deg, #2c3a49 0%, #3d5568 100%);
}
.fill {
  position: absolute; left: 0; top: 0; height: 100%; width: 0%;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--d-accent), var(--d-accent2));
  transition: width 0.18s ease;
}
.ticks {
  display: flex; justify-content: space-between;
  color: var(--d-muted); font-size: 11px; margin-top: 6px;
  font-variant-numeric: tabular-nums;
}

/* ---- 快捷按钮 ---- */
.quick { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.quick button {
  flex: 1; min-width: 68px;
  background: var(--d-panel2); border: 1px solid var(--d-line); color: var(--d-muted);
  border-radius: 8px; padding: 8px 4px; font-size: 12px; cursor: pointer;
  transition: all 0.12s; font-family: inherit; line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
.quick button b { display: block; color: var(--d-txt); font-size: 12.5px; }
.quick button:hover { border-color: var(--d-accent); color: var(--d-txt); }

/* ---- 消息 ---- */
.msg { margin-top: 14px; min-height: 20px; font-size: 13px; display: flex; align-items: center; }
.msg.ok { color: var(--d-accent2); }
.msg.warn { color: var(--d-warn); }
.msg.err { color: var(--d-err); }

.clearbtn {
  margin-top: 12px; width: 100%;
  background: transparent; border: 1px dashed var(--d-line); color: var(--d-muted);
  padding: 8px; border-radius: 8px; cursor: pointer; font-size: 12.5px;
  transition: all 0.12s; font-family: inherit;
}
.clearbtn:hover { color: var(--d-err); border-color: var(--d-err); }

/* ---- 速查表 ---- */
.reftb { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
.reftb th {
  text-align: right; padding: 7px 12px;
  background: var(--d-panel2); color: var(--d-muted);
  font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
  border-bottom: 1px solid var(--d-line);
}
.reftb th:first-child { text-align: left; }
.reftb td {
  padding: 7px 12px; text-align: right; border-bottom: 1px solid #212c38;
  cursor: pointer; transition: background 0.1s; color: var(--d-txt);
}
.reftb td:first-child { text-align: left; color: var(--d-accent2); font-weight: 600; }
.reftb td:last-child { color: var(--d-muted); font-size: 12px; }
.reftb tbody tr:last-child td { border-bottom: none; }
.reftb tbody tr:hover td { background: #1a2430; }
.reftb td.sig { color: var(--d-accent); font-weight: 600; }

.empty-cfg {
  padding: 16px; text-align: center; font-size: 12.5px; color: var(--d-dim);
  border: 1px dashed var(--d-line); border-radius: 9px;
}

/* ---- 公式 ---- */
.fx-l {
  font-family: Consolas, "Courier New", monospace;
  font-size: 12.5px; color: var(--d-muted);
  background: var(--d-panel2);
  border-left: 2px solid var(--d-accent);
  border-radius: 7px; padding: 8px 12px; margin-bottom: 6px;
  overflow-x: auto;
}
.fx-l code { color: var(--d-txt); font-size: 12.5px; }
.foot {
  display: flex; justify-content: space-between; gap: 10px;
  margin-top: 12px; font-size: 11.5px; color: var(--d-dim); flex-wrap: wrap;
}

/* ---- 移动端 ---- */
@media (max-width: 640px) {
  .ac-tool { gap: 12px; }
  .panel { border-radius: 13px; padding: 14px 13px; }
  .seg { gap: 6px; }
  .seg-btn { min-width: 62px; font-size: 12px; padding: 9px 4px; }
  .cfg-row { grid-template-columns: 1fr 1fr; }
  .quick { gap: 6px; }
  .quick button { min-width: 54px; font-size: 11px; }
  .inp { font-size: 20px; }
  .reftb th, .reftb td { padding: 6px 8px; font-size: 12px; }
}
@media (max-width: 380px) {
  .cfg-row { grid-template-columns: 1fr; }
}
</style>
