<script setup lang="ts">
/**
 * DustSamplingCalculator.vue — 烟尘采样模型（颗粒物）
 *
 * 设计目标：
 *  - 通用工具：标题下不挂标准特指提示，页头副标题在工具详情页隐藏
 *  - 全字段可选：不做内置预填，输入即算；算不出的结果标「缺 xxx」
 *  - 多计算模式：按《烟尘相关计算公式(1).xlsx》各区块拆分为独立工具，选择模式进入对应工具
 *  - 工具化：暗色仪表盘风格、大号输入 + 单位后缀、实时联动、清空/示例
 *  - 移动端 H5 适配：单列大字号、44px 触控高度、结果两列
 *
 * 公式来源：GB/T 16157 + 《烟尘相关计算公式(1).xlsx》（9 个公式已逐格校对复核）
 */
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import { useAuthStore } from "@/stores/auth";
import { O2_BASELINES } from "@/utils/o2-baseline";
import {
  DUST_MODES, DUST_MODE_MAP, DUST_MODE_DEMO, missingOfResult, type DustMode,
} from "@/utils/flue-dust-modes";
import type { DustBasis } from "@/utils/flue-dust-sampling";

const auth = useAuthStore();
const isAdmin = computed(() => auth.isAdmin());

/* ============ 模式 ============ */
const modeId = ref<string>("full");
const mode = computed<DustMode>(() => DUST_MODE_MAP[modeId.value] ?? DUST_MODES[DUST_MODES.length - 1]);

/** 每个模式一套独立输入，互不干扰 */
const forms = reactive<Record<string, Record<string, number | null>>>({});
for (const m of DUST_MODES) {
  const f: Record<string, number | null> = {};
  for (const fd of m.fields) f[fd.key] = null;
  forms[m.id] = f;
}

const curForm = computed(() => forms[modeId.value]);
const curBasis = reactive<Record<string, DustBasis>>({});
for (const m of DUST_MODES) curBasis[m.id] = "wet";

/* ============ 基准含氧量 ============ */
const o2BaseOptions = O2_BASELINES.map((b) => ({
  value: b.o2s,
  label: `${b.label} ${b.o2s}%`,
}));
const o2BaseCustom = reactive<Record<string, boolean>>({});
for (const m of DUST_MODES) o2BaseCustom[m.id] = false;

function onO2BaseSelect(mId: string, e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v === "custom") {
    o2BaseCustom[mId] = true;
    return;
  }
  o2BaseCustom[mId] = false;
  forms[mId].o2base = v === "" ? null : Number(v);
}

/* ============ 输入处理：允许负号，非法字符过滤 ============ */
function onInput(mId: string, key: string, e: Event) {
  const el = e.target as HTMLInputElement;
  const clean = el.value.replace(/[^0-9.\-]/g, "");
  el.value = clean;
  if (clean === "" || clean === "-" || clean === ".") {
    forms[mId][key] = null;
    return;
  }
  const n = parseFloat(clean);
  forms[mId][key] = Number.isFinite(n) ? n : null;
}

/* ============ 计算 ============ */
interface ModeResult {
  values: Record<string, number | null>;
  notes: Record<string, string | undefined>;
  steps: string[];
}

const results = computed<Record<string, ModeResult>>(() => {
  const out: Record<string, ModeResult> = {};
  for (const m of DUST_MODES) {
    try {
      out[m.id] = m.compute(forms[m.id] ?? {}, curBasis[m.id]);
    } catch {
      out[m.id] = { values: {}, notes: {}, steps: [] };
    }
  }
  return out;
});

const curResult = computed(() => results.value[modeId.value]);

function fmt(def: { digits: number }, v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (def.digits === 0) return Math.round(v).toLocaleString("zh-CN");
  return v.toFixed(def.digits);
}

/* ============ 缺失依赖说明 ============
 * 统一走 flue-dust-modes.ts 的中央依赖表，平台与小程序口径一致 */
function missingOf(m: DustMode, key: string): string {
  return missingOfResult(key, forms[m.id] ?? {}, curResult.value?.values ?? {});
}

/* ============ 操作 ============ */
function loadDemo() {
  const demo = DUST_MODE_DEMO[modeId.value] ?? {};
  const f = forms[modeId.value];
  for (const key of Object.keys(f)) f[key] = demo[key] ?? null;
  o2BaseCustom[modeId.value] = false;
  ElMessage.success("已填入示例数据");
}

function clearAll() {
  const f = forms[modeId.value];
  for (const key of Object.keys(f)) f[key] = null;
  o2BaseCustom[modeId.value] = false;
  ElMessage.info("已清空");
}

function switchMode(id: string) {
  modeId.value = id;
}

const showExplain = ref(false);
const showAllSteps = ref(false);

watch(modeId, () => { showAllSteps.value = false; });
</script>

<template>
  <div class="ds">
    <!-- ===== 模式选择器 ===== -->
    <section class="panel modes">
      <div class="modes-h">
        <span class="modes-t">选择计算工具</span>
        <span class="modes-s">{{ mode.ref }} · {{ mode.desc }}</span>
      </div>
      <div class="mode-grid">
        <button
          v-for="m in DUST_MODES"
          :key="m.id"
          :class="['mode', { active: modeId === m.id }]"
          @click="switchMode(m.id)"
        >
          <span class="mode-ico"><Icon :name="m.icon" :size="16" /></span>
          <span class="mode-n">{{ m.name }}</span>
          <span class="mode-r">{{ m.ref }}</span>
        </button>
      </div>
    </section>

    <!-- ===== 计算面板 ===== -->
    <section class="panel">
      <header class="bar">
        <div class="bar-l">
          <span class="dot" />
          <div class="bar-t">
            <b>{{ mode.name }}</b>
            <span class="bar-s">{{ mode.desc }}</span>
          </div>
        </div>
        <div class="bar-r">
          <button class="ghost" @click="loadDemo">填入示例</button>
          <button class="ghost danger" @click="clearAll">清空</button>
        </div>
      </header>

      <div class="body">
        <!-- ===== 左：输入区 ===== -->
        <div class="in">
          <!-- 干湿基口径 -->
          <div v-if="mode.hasBasis" class="basis">
            <div class="basis-t">干湿基口径</div>
            <div class="basis-seg">
              <button
                :class="['bbtn', { active: curBasis[modeId] === 'wet' }]"
                @click="curBasis[modeId] = 'wet'"
              >湿基</button>
              <button
                :class="['bbtn', { active: curBasis[modeId] === 'dry' }]"
                @click="curBasis[modeId] = 'dry'"
              >干基</button>
            </div>
            <div class="basis-tip">
              {{ curBasis[modeId] === 'wet'
                ? '湿基：体积与浓度均为湿基读数口径，标杆流量折算到标态但不做干基修正'
                : '干基：体积与浓度按含湿量修正到干基（GB/T 16157 口径），与排放标准限值对齐' }}
            </div>
          </div>

          <div class="flds">
            <div v-for="f in mode.fields" :key="f.key" class="fld">
              <label>
                <span class="lbl">{{ f.label }}</span>
                <span class="sym">{{ f.sym }}</span>
              </label>
              <!-- 基准含氧量：下拉 + 自定义 -->
              <div v-if="f.type === 'o2base'" class="wrap">
                <select
                  class="sel"
                  :value="o2BaseCustom[modeId] ? 'custom' : (curForm[f.key] === null ? '' : String(curForm[f.key]))"
                  @change="onO2BaseSelect(modeId, $event)"
                >
                  <option value="">选择行业基准…</option>
                  <option v-for="o in o2BaseOptions" :key="o.value" :value="String(o.value)">
                    {{ o.label }}
                  </option>
                  <option value="custom">自定义输入</option>
                </select>
                <span class="unit">%</span>
              </div>
              <div v-else class="wrap">
                <input
                  class="inp"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  :value="curForm[f.key] === null ? '' : String(curForm[f.key])"
                  :placeholder="f.ph || ''"
                  @input="onInput(modeId, f.key, $event)"
                />
                <span class="unit">{{ f.unit }}</span>
              </div>
              <div v-if="f.tip" class="fld-tip">{{ f.tip }}</div>
            </div>
          </div>
        </div>

        <!-- ===== 右：结果区 ===== -->
        <div class="out">
          <div class="res-grid">
            <div
              v-for="d in mode.results"
              :key="d.key"
              :class="['res', { primary: d.primary, empty: (curResult?.values[d.key] ?? null) === null }]"
              :title="d.formula"
            >
              <span class="r-l">{{ d.label }}</span>
              <div class="r-v">
                <b :class="{ sm: (curResult?.values[d.key] ?? null) !== null && fmt(d, curResult!.values[d.key]).length > 5 }">
                  {{ fmt(d, curResult?.values[d.key] ?? null) }}
                </b>
                <span v-if="d.unit" class="r-u">{{ d.unit }}</span>
              </div>
              <div v-if="(curResult?.values[d.key] ?? null) === null" class="r-miss">
                缺 {{ missingOf(mode, d.key) }}
              </div>
              <div v-else-if="curResult?.notes?.[d.key]" class="r-note">{{ curResult?.notes?.[d.key] }}</div>
              <div v-else-if="d.note" class="r-note">{{ d.note }}</div>
            </div>
          </div>

          <!-- 计算过程 -->
          <div class="steps" v-if="isAdmin && curResult && curResult.steps.length">
            <div class="steps-t" @click="showAllSteps = !showAllSteps">
              计算过程
              <span class="toggle">{{ showAllSteps ? "收起 ▲" : "展开 ▼" }}</span>
            </div>
            <div v-show="showAllSteps" class="step-list">
              <div v-for="(s, i) in curResult.steps" :key="i" class="step">{{ s }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 公式与说明 ===== -->
    <section class="panel doc">
      <div class="doc-h" @click="showExplain = !showExplain">
        <div class="doc-t">
          <Icon name="flask" :size="15" />
          <b>公式与口径说明</b>
        </div>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="doc-b">
        <div class="fx">
          <div class="fx-t">压力换算</div>
          <div class="fx-l"><code>Ps = Pt − Δp·Kp²/1000</code></div>
          <div class="fx-l"><code>Pt = Ps + Δp·Kp²/1000</code></div>
          <div class="fx-l"><code>P = Ba + Ps（烟气绝对压力）</code></div>
        </div>
        <div class="fx">
          <div class="fx-t">工况与流速</div>
          <div class="fx-l"><code>ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325</code></div>
          <div class="fx-l"><code>Vs = 1.414 × Kp × √(Δp/ρ)</code></div>
          <div class="fx-l"><code>Qrs = 0.047 × d² × Vs × (1 − Xsw/100)</code></div>
          <div class="fx-l"><code>D = √(Qrs / (0.047 × Vs × (1 − Xsw/100)))</code></div>
        </div>
        <div class="fx">
          <div class="fx-t">体积</div>
          <div class="fx-l"><code>V = Qrs × n（烟温静压法）</code></div>
          <div class="fx-l"><code>V' = Qrs × (Ba+Ps)(273.15+t′) / [(Ba+P′)(273.15+t)] × n（计温计压法）</code></div>
          <div class="fx-l"><code>Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325（干基再乘 1 − Xsw/100）</code></div>
        </div>
        <div class="fx">
          <div class="fx-t">流量</div>
          <div class="fx-l"><code>Qs = Vs × F × 3600</code></div>
          <div class="fx-l"><code>Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)</code></div>
        </div>
        <div class="fx">
          <div class="fx-t">浓度 · 折算 · 排放</div>
          <div class="fx-l"><code>C = (g2 − g1) / Vnd × 10⁶</code></div>
          <div class="fx-l"><code>α = 21/(21 − O₂实测)；αs = 21/(21 − O₂基准)</code></div>
          <div class="fx-l"><code>Cα = C × α/αs × 出力系数</code></div>
          <div class="fx-l"><code>G = C × Qn × 10⁻⁶</code></div>
        </div>
        <ul class="notes">
          <li><b>全压与静压可互相换算</b>：Pt = Ps + Δp·Kp²/1000。填任一即可，另一项自动推算；两者都填时以实测静压为准并给出推算全压。</li>
          <li><b>干湿基口径</b>：同一模式下切换湿基/干基，标况体积、颗粒物浓度、标杆流量、排放速率四项同步切换，始终保持 C × Qn × 10⁻⁶ ≡ G。</li>
          <li><b>含湿量口径</b>：Xsw 统一按百分数数值填入（如 7.89 表示 7.89%），干基折算因子统一为 (1 − Xsw/100)。</li>
          <li><b>标态温度</b>：统一取 273.15 K（0℃）、101.325 kPa。</li>
          <li><b>含氧量折算</b>：基准含氧量按行业标准选择（火电燃煤 6%、锅炉燃煤 9%、燃油/燃气 3/3.5%、水泥窑 10%、垃圾焚烧 11%、烧结 16% 等），也支持自定义。</li>
          <li><b>负荷系数</b>（出力系数）：锅炉按运行年限查表，一般验收监测取 1。</li>
          <li>公式经《烟尘相关计算公式(1).xlsx》逐格校对复核；参照 GB/T 16157《固定污染源排气中颗粒物测定与气态污染物采样方法》。</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ================= 暗色仪表盘主题（工具化风格） ================= */
.ds {
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
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.panel {
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.28);
  color: var(--d-txt);
}

/* ---- 模式选择器 ---- */
.modes { padding: 16px 20px 18px; }
.modes-h {
  display: flex; align-items: baseline; gap: 12px;
  margin-bottom: 13px; flex-wrap: wrap;
}
.modes-t {
  font-size: 11.5px; letter-spacing: 1px; text-transform: uppercase;
  color: var(--d-accent); font-weight: 600;
}
.modes-s { font-size: 12.5px; color: var(--d-muted); }
.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 9px;
}
.mode {
  display: flex; flex-direction: column; align-items: flex-start; gap: 5px;
  background: var(--d-panel);
  border: 1px solid var(--d-line);
  border-radius: 11px;
  padding: 12px 13px;
  cursor: pointer;
  text-align: left;
  transition: all 0.16s;
  font-family: inherit;
}
.mode:hover { border-color: rgba(79, 195, 247, 0.5); }
.mode.active {
  border-color: var(--d-accent);
  background: rgba(79, 195, 247, 0.1);
  box-shadow: 0 0 0 1px rgba(79, 195, 247, 0.25);
}
.mode-ico { color: var(--d-accent2); display: flex; }
.mode.active .mode-ico { color: var(--d-accent); }
.mode-n { font-size: 13.5px; font-weight: 600; color: var(--d-txt); line-height: 1.35; }
.mode.active .mode-n { color: var(--d-accent); }
.mode-r { font-size: 10.5px; color: var(--d-dim); }

/* ---- 顶部状态条 ---- */
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 12px;
  flex-wrap: wrap;
}
.bar-l { display: flex; align-items: center; gap: 11px; min-width: 0; }
.dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--d-accent2);
  box-shadow: 0 0 10px var(--d-accent2);
  flex: none;
}
.bar-t { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.bar-t b { font-size: 16.5px; font-weight: 600; letter-spacing: 0.2px; }
.bar-s { font-size: 12px; color: var(--d-muted); }
.bar-r { display: flex; gap: 8px; }
.ghost {
  background: var(--d-panel2);
  border: 1px solid var(--d-line);
  color: var(--d-muted);
  border-radius: 9px;
  padding: 8px 14px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  font-family: inherit;
}
.ghost:hover { border-color: var(--d-accent); color: var(--d-txt); }
.ghost.danger:hover { border-color: var(--d-err); color: var(--d-err); }

/* ---- 主体两栏 ---- */
.body {
  display: grid;
  grid-template-columns: minmax(300px, 420px) 1fr;
}
.in {
  padding: 18px 20px 20px;
  border-right: 1px solid var(--d-line);
  background: var(--d-panel);
}
.out {
  padding: 18px 20px 20px;
  background: var(--d-bg);
  min-width: 0;
}

/* ---- 干湿基口径 ---- */
.basis {
  background: var(--d-panel2);
  border: 1px solid var(--d-line);
  border-radius: 11px;
  padding: 12px 13px;
  margin-bottom: 16px;
}
.basis-t {
  font-size: 11.5px; letter-spacing: 0.8px; text-transform: uppercase;
  color: var(--d-accent); margin-bottom: 9px;
}
.basis-seg { display: flex; gap: 7px; }
.bbtn {
  flex: 1;
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  color: var(--d-muted);
  border-radius: 8px;
  padding: 8px 0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.bbtn:hover { border-color: var(--d-accent); color: var(--d-txt); }
.bbtn.active {
  background: rgba(79, 195, 247, 0.14);
  border-color: var(--d-accent);
  color: var(--d-accent);
  font-weight: 600;
}
.basis-tip {
  margin-top: 9px;
  font-size: 11px;
  color: var(--d-dim);
  line-height: 1.55;
}

/* ---- 输入 ---- */
.flds { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fld { min-width: 0; }
.fld label {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 6px; margin-bottom: 6px;
}
.lbl { font-size: 12.5px; color: var(--d-muted); }
.sym {
  font-size: 11px; color: var(--d-dim);
  font-family: Consolas, "Courier New", monospace;
}
.fld-tip { font-size: 10.5px; color: var(--d-dim); margin-top: 4px; line-height: 1.4; }
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
.inp, .sel {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: var(--d-txt);
  font-size: 20px; font-weight: 600;
  padding: 10px 6px 10px 13px;
  font-variant-numeric: tabular-nums;
  width: 100%;
  appearance: none;
}
.sel {
  font-size: 14px; font-weight: 500;
  padding: 11px 26px 11px 13px;
  background-image: linear-gradient(45deg, transparent 50%, var(--d-muted) 50%),
    linear-gradient(135deg, var(--d-muted) 50%, transparent 50%);
  background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.sel option { background: var(--d-panel2); color: var(--d-txt); }
.inp::placeholder { color: #3f4b59; font-weight: 400; font-size: 14px; }
.unit {
  color: var(--d-muted); font-size: 13px;
  padding-right: 12px; white-space: nowrap; flex: none;
}

/* ---- 结果区 ---- */
.res-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 9px;
}
.res {
  background: var(--d-panel);
  border: 1px solid var(--d-line);
  border-radius: 11px;
  padding: 11px 13px;
  display: flex; flex-direction: column; gap: 3px;
  min-width: 0;
}
.r-l {
  font-size: 11.5px; color: var(--d-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.r-v {
  display: flex; align-items: baseline; gap: 4px;
  min-width: 0; flex-wrap: nowrap;
}
.r-v b {
  font-size: 20px; font-weight: 700; color: var(--d-txt);
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}
.r-v b.sm { font-size: 16px; }
.r-u { font-size: 11.5px; color: var(--d-muted); flex: none; white-space: nowrap; }
.r-miss { font-size: 11px; color: var(--d-warn); line-height: 1.45; }
.r-note { font-size: 10.5px; color: var(--d-dim); }
.res.primary {
  background: rgba(79, 195, 247, 0.08);
  border-color: rgba(79, 195, 247, 0.32);
}
.res.primary .r-v b { color: var(--d-accent); font-size: 24px; }
.res.primary .r-l { color: var(--d-accent2); }
.res.empty { opacity: 0.72; }
.res.empty .r-v b { color: var(--d-dim); font-size: 17px; }

/* ---- 计算过程 ---- */
.steps {
  margin-top: 14px;
  background: var(--d-panel);
  border: 1px solid var(--d-line);
  border-radius: 11px;
  padding: 11px 14px;
}
.steps-t {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; color: var(--d-muted); cursor: pointer; user-select: none;
}
.toggle { font-size: 11.5px; color: var(--d-dim); }
.step-list { margin-top: 8px; max-height: 260px; overflow-y: auto; }
.step {
  font-size: 12px; color: var(--d-muted);
  font-family: Consolas, "Courier New", monospace;
  line-height: 1.85;
  word-break: break-all;
}

/* ---- 说明卡 ---- */
.doc { background: var(--d-panel); }
.doc-h {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; cursor: pointer; user-select: none;
}
.doc-t { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.doc-b { padding: 0 20px 18px; }
.fx { margin-bottom: 14px; }
.fx-t {
  font-size: 11.5px; color: var(--d-accent);
  letter-spacing: 0.6px; margin-bottom: 7px;
}
.fx-l {
  font-family: Consolas, "Courier New", monospace;
  font-size: 12.5px; color: var(--d-muted);
  background: var(--d-panel2);
  border-left: 2px solid var(--d-accent);
  border-radius: 6px;
  padding: 7px 11px;
  margin-bottom: 5px;
  overflow-x: auto;
}
.fx-l code { color: var(--d-txt); }
.notes { margin: 6px 0 0; padding-left: 18px; }
.notes li {
  font-size: 12.5px; color: var(--d-muted);
  line-height: 1.9; margin-bottom: 2px;
}
.notes b { color: var(--d-txt); }

/* ================= 移动端 H5 ================= */
@media (max-width: 960px) {
  .body { grid-template-columns: 1fr; }
  .in { border-right: none; border-bottom: 1px solid var(--d-line); }
}

@media (max-width: 640px) {
  .ds { gap: 12px; }
  .panel { border-radius: 13px; }
  .modes { padding: 13px 14px 15px; }
  .mode-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
  .mode { padding: 10px 11px; }
  .mode-n { font-size: 12.5px; }
  .bar { padding: 13px 14px 10px; }
  .bar-t b { font-size: 15px; }
  .bar-s { font-size: 11.5px; }
  .bar-r { width: 100%; }
  .bar-r .ghost { flex: 1; }
  .in, .out { padding: 14px; }
  .flds { grid-template-columns: 1fr 1fr; gap: 9px; }
  .inp { font-size: 18px; padding: 11px 4px 11px 11px; }
  .sel { font-size: 13px; }
  .unit { font-size: 11.5px; padding-right: 9px; }
  .res-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
  .res { padding: 9px 11px; border-radius: 10px; }
  .r-v b { font-size: 17px; }
  .res.primary .r-v b { font-size: 20px; }
  .r-miss { font-size: 10.5px; }
  .doc-h { padding: 12px 14px; }
  .doc-b { padding: 0 14px 14px; }
  .fx-l { font-size: 11.5px; padding: 6px 9px; }
  .notes li { font-size: 12px; line-height: 1.75; }
}

@media (max-width: 380px) {
  .flds { grid-template-columns: 1fr; }
  .res-grid { grid-template-columns: 1fr; }
  .mode-grid { grid-template-columns: 1fr; }
}
</style>
