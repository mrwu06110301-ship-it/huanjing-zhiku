<script setup lang="ts">
/**
 * DustSamplingCalculator.vue — 烟尘采样模型（颗粒物）
 *
 * 设计目标：
 *  - 通用工具：标题下不再挂标准特指提示，页头副标题在工具详情页隐藏
 *  - 全字段可选：不做内置预填，输入即算；算不出的结果标「缺 xx」
 *  - 工具化：暗色仪表盘风格、大号输入 + 单位后缀、实时联动、清空/示例/快捷赋值
 *  - 移动端 H5 适配：单列大字号、44px 触控高度、结果两列
 *
 * 公式来源：GB/T 16157 + 《烟尘相关计算公式(1).xlsx》（9 个公式已逐格校对复核）
 */
import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import { useAuthStore } from "@/stores/auth";
import { O2_BASELINES } from "@/utils/o2-baseline";
import {
  computeDustSampling, DUST_DEMO, type DustSamplingResult, type DustValue,
} from "@/utils/flue-dust-sampling";

const auth = useAuthStore();
const isAdmin = computed(() => auth.isAdmin());

/* ============ 输入项定义 ============ */
interface FieldDef {
  k: keyof typeof form;
  label: string;
  sym: string;
  unit: string;
  ph?: string;
}
const form = reactive({
  dynamicPressure: null as number | null,
  staticPressure: null as number | null,
  totalPressure: null as number | null,
  stackTemp: null as number | null,
  atmosphere: null as number | null,
  moisture: null as number | null,
  pitotCoefficient: null as number | null,
  crossSection: null as number | null,
  nozzleDiameter: null as number | null,
  samplingMinutes: null as number | null,
  filterInitialMass: null as number | null,
  filterFinalMass: null as number | null,
  meterTemp: null as number | null,
  meterPressure: null as number | null,
  O2: null as number | null,
  O2Base: null as number | null,
  loadFactor: null as number | null,
  dryBasisVolume: false,
});

const GROUPS: { title: string; icon: string; fields: FieldDef[] }[] = [
  {
    title: "工况实测",
    icon: "chimney",
    fields: [
      { k: "dynamicPressure", label: "平均动压", sym: "Hd", unit: "Pa", ph: "如 25" },
      { k: "staticPressure", label: "平均静压", sym: "Ps", unit: "kPa", ph: "负压填负" },
      { k: "totalPressure", label: "烟气全压", sym: "Pt", unit: "kPa", ph: "反算静压用" },
      { k: "stackTemp", label: "平均烟温", sym: "t", unit: "℃", ph: "如 93.4" },
      { k: "atmosphere", label: "大气压", sym: "Ba", unit: "kPa", ph: "如 101.9" },
      { k: "moisture", label: "含湿量", sym: "Xsw", unit: "%", ph: "如 7.89" },
      { k: "pitotCoefficient", label: "皮托管系数", sym: "Kp", unit: "", ph: "S 型 0.84" },
      { k: "crossSection", label: "烟道截面积", sym: "F", unit: "m²", ph: "如 1.7671" },
    ],
  },
  {
    title: "采样与称量",
    icon: "filter",
    fields: [
      { k: "nozzleDiameter", label: "采样嘴直径", sym: "d", unit: "mm", ph: "如 8" },
      { k: "samplingMinutes", label: "累计采样时长", sym: "n", unit: "min", ph: "如 45" },
      { k: "filterInitialMass", label: "滤筒初始重量", sym: "g1", unit: "g", ph: "如 10.1359" },
      { k: "filterFinalMass", label: "滤筒最终重量", sym: "g2", unit: "g", ph: "如 10.1545" },
    ],
  },
  {
    title: "折算参数",
    icon: "trendUp",
    fields: [
      { k: "O2", label: "实测 O₂ 浓度", sym: "O₂", unit: "%", ph: "如 14.2" },
      { k: "O2Base", label: "基准含氧量", sym: "O₂s", unit: "%", ph: "选择或自定义" },
      { k: "loadFactor", label: "负荷（出力）系数", sym: "k", unit: "", ph: "一般取 1" },
    ],
  },
  {
    title: "采样流量计（可选）",
    icon: "flask",
    fields: [
      { k: "meterTemp", label: "计温", sym: "t′", unit: "℃", ph: "流量计读数" },
      { k: "meterPressure", label: "计压", sym: "P′", unit: "kPa", ph: "负压填负数" },
    ],
  },
];

/* ============ 基准含氧量选择 ============ */
const o2BaseCustom = ref(false);
const o2BaseOptions = O2_BASELINES.map((b) => ({
  value: b.o2s,
  label: `${b.label} ${b.o2s}%`,
  std: b.std,
}));
function onO2BaseSelect(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v === "custom") {
    o2BaseCustom.value = true;
    return;
  }
  o2BaseCustom.value = false;
  form.O2Base = v === "" ? null : Number(v);
}

/* ============ 输入处理：允许负号，非法字符过滤 ============ */
function onInput(key: keyof typeof form, e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const clean = raw.replace(/[^0-9.\-]/g, "");
  (e.target as HTMLInputElement).value = clean;
  if (clean === "" || clean === "-" || clean === ".") {
    (form as any)[key] = null;
    return;
  }
  const n = parseFloat(clean);
  (form as any)[key] = Number.isFinite(n) ? n : null;
}

/* ============ 快捷赋值（不预填，仅一键写入） ============ */
const QUICKS = [
  { label: "皮托管 Kp 0.84", apply: () => { form.pitotCoefficient = 0.84; } },
  { label: "大气压 101.325 kPa", apply: () => { form.atmosphere = 101.325; } },
  { label: "基准 O₂ 9%", apply: () => { form.O2Base = 9; o2BaseCustom.value = false; } },
  { label: "出力系数 1", apply: () => { form.loadFactor = 1; } },
];

/* ============ 计算 ============ */
const result = computed<DustSamplingResult>(() =>
  computeDustSampling({ ...form, dryBasisVolume: form.dryBasisVolume })
);

/* ============ 结果分组 ============ */
const RES_GROUPS: { title: string; keys: string[] }[] = [
  { title: "核心结果", keys: ["concentration", "concentrationAdjusted", "emissionRate"] },
  {
    title: "工况与采样",
    keys: ["velocity", "isokineticFlow", "volumeWet", "volumeStandard", "flueGasFlow", "dryStandardFlow"],
  },
  {
    title: "过程参数",
    keys: ["density", "staticPressure", "pressureAbs", "dustMass", "alpha", "alphaS", "nozzleDiameterCalc", "volumeMeter"],
  },
];

/** 展示用短标签（完整名放 title 提示，避免卡片内换行挤压数值） */
const RES_SHORT: Record<string, string> = {
  dryStandardFlow: "标杆烟气流量 Qn",
  flueGasFlow: "实际烟气流量 Qs",
  volumeStandard: "标况采样体积 Vnd",
  volumeWet: "工况采样体积 V",
  volumeMeter: "计温计压法体积",
  nozzleDiameterCalc: "采样嘴直径（反算）",
  concentrationAdjusted: "折算浓度 Cα",
  emissionRate: "颗粒物排放速率 G",
  concentration: "颗粒物浓度 C",
  staticPressure: "烟气静压 Ps",
  pressureAbs: "烟气绝对压力 P",
};

function resItem(key: string): DustValue | undefined {
  return result.value.values[key];
}
function fmt(v: DustValue): string {
  if (v.value === null) return "—";
  if (v.digits === 0) return v.value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  return v.value.toFixed(v.digits);
}
/** 缺失说明（最多两条，超出折叠） */
function missText(v: DustValue): string {
  if (v.value !== null || v.missing.length === 0) return "";
  return v.missing.join("、");
}

/* ============ 操作 ============ */
function loadDemo() {
  Object.assign(form, {
    dynamicPressure: DUST_DEMO.dynamicPressure,
    staticPressure: DUST_DEMO.staticPressure,
    totalPressure: null,
    stackTemp: DUST_DEMO.stackTemp,
    atmosphere: DUST_DEMO.atmosphere,
    moisture: DUST_DEMO.moisture,
    pitotCoefficient: DUST_DEMO.pitotCoefficient,
    crossSection: DUST_DEMO.crossSection,
    nozzleDiameter: DUST_DEMO.nozzleDiameter,
    samplingMinutes: DUST_DEMO.samplingMinutes,
    filterInitialMass: DUST_DEMO.filterInitialMass,
    filterFinalMass: DUST_DEMO.filterFinalMass,
    meterTemp: null,
    meterPressure: null,
    O2: DUST_DEMO.O2,
    O2Base: DUST_DEMO.O2Base,
    loadFactor: DUST_DEMO.loadFactor,
  });
  o2BaseCustom.value = false;
  ElMessage.success("已填入示例数据");
}

function clearAll() {
  Object.keys(form).forEach((k) => {
    if (k === "dryBasisVolume") return;
    (form as any)[k] = null;
  });
  o2BaseCustom.value = false;
  ElMessage.info("已清空");
}

const showExplain = ref(false);
const showAllSteps = ref(false);
</script>

<template>
  <div class="ds">
    <!-- ===== 仪表盘主体 ===== -->
    <section class="panel">
      <!-- 顶部状态条 -->
      <header class="bar">
        <div class="bar-l">
          <span class="dot" />
          <div class="bar-t">
            <b>烟尘（颗粒物）采样计算</b>
            <span class="bar-s">
              已算出 <b class="hl">{{ result.computedCount }}</b> / {{ result.totalCount }} 项
            </span>
          </div>
        </div>
        <div class="bar-r">
          <button class="ghost" @click="loadDemo">填入示例</button>
          <button class="ghost danger" @click="clearAll">清空</button>
        </div>
      </header>

      <!-- 进度条 -->
      <div class="prog">
        <div class="prog-fill" :style="{ width: (result.computedCount / result.totalCount * 100) + '%' }" />
      </div>

      <div class="body">
        <!-- ===== 左：输入区 ===== -->
        <div class="in">
          <div v-for="g in GROUPS" :key="g.title" class="grp">
            <div class="grp-h">
              <Icon :name="g.icon" :size="14" />
              <span>{{ g.title }}</span>
            </div>

            <div class="flds">
              <div v-for="f in g.fields" :key="f.k" class="fld">
                <label>
                  <span class="lbl">{{ f.label }}</span>
                  <span class="sym">{{ f.sym }}</span>
                </label>
                <!-- 基准含氧量：下拉 + 自定义 -->
                <div v-if="f.k === 'O2Base'" class="wrap">
                  <select
                    class="sel"
                    :value="o2BaseCustom ? 'custom' : (form.O2Base === null ? '' : String(form.O2Base))"
                    @change="onO2BaseSelect"
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
                    :value="form[f.k] === null ? '' : String(form[f.k])"
                    :placeholder="f.ph || ''"
                    @input="onInput(f.k, $event)"
                  />
                  <span class="unit">{{ f.unit }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 快捷赋值 -->
          <div class="quick">
            <button v-for="q in QUICKS" :key="q.label" class="qbtn" @click="q.apply()">
              {{ q.label }}
            </button>
          </div>

          <!-- 口径开关 -->
          <label class="switch">
            <input type="checkbox" v-model="form.dryBasisVolume" />
            <span class="sw-box" />
            <span class="sw-txt">
              标况体积按<b>干基</b>折算（GB/T 16157 口径）<br />
              <i>关闭 = 湿基，与 ZR-3260D 报表口径一致</i>
            </span>
          </label>
        </div>

        <!-- ===== 右：结果区 ===== -->
        <div class="out">
          <div v-for="g in RES_GROUPS" :key="g.title" class="res-grp">
            <div class="res-h">{{ g.title }}</div>
            <div class="res-grid">
              <div
                v-for="k in g.keys"
                :key="k"
                :class="['res', { primary: ['concentration','concentrationAdjusted','emissionRate'].includes(k), empty: resItem(k)?.value === null }]"
                :title="resItem(k)?.formula"
              >
                <span class="r-l">{{ RES_SHORT[k] || resItem(k)?.label }}</span>
                <div class="r-v">
                  <b :class="{ sm: resItem(k) && resItem(k)!.value !== null && fmt(resItem(k)!).length > 5 }">
                    {{ resItem(k) ? fmt(resItem(k)!) : '—' }}
                  </b>
                  <span v-if="resItem(k)?.unit" class="r-u">{{ resItem(k)?.unit }}</span>
                </div>
                <div v-if="resItem(k)?.value === null" class="r-miss">
                  缺 {{ missText(resItem(k)!) }}
                </div>
                <div v-else-if="resItem(k)?.note" class="r-note">{{ resItem(k)?.note }}</div>
              </div>
            </div>
          </div>

          <!-- 计算过程 -->
          <div class="steps" v-if="isAdmin && result.steps.length">
            <div class="steps-t" @click="showAllSteps = !showAllSteps">
              计算过程
              <span class="toggle">{{ showAllSteps ? "收起 ▲" : "展开 ▼" }}</span>
            </div>
            <div v-show="showAllSteps" class="step-list">
              <div v-for="(s, i) in result.steps" :key="i" class="step">{{ s }}</div>
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
          <div class="fx-t">工况与流速</div>
          <div class="fx-l"><code>Ps = Pt − (Hd/1000) × Kp²</code></div>
          <div class="fx-l"><code>ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325</code></div>
          <div class="fx-l"><code>Vs = 1.414 × Kp × √(Hd/ρ)</code></div>
        </div>
        <div class="fx">
          <div class="fx-t">等速采样与体积</div>
          <div class="fx-l"><code>Qrs = 0.047 × d² × Vs × (1 − Xsw/100)</code></div>
          <div class="fx-l"><code>D = √(Qrs / (0.047 × Vs × (1 − Xsw/100)))</code></div>
          <div class="fx-l"><code>V = Qrs × n</code></div>
          <div class="fx-l"><code>Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325</code></div>
          <div class="fx-l"><code>V′ = Qrs × (Ba+Ps)(273.15+t′) / [(Ba+P′)(273.15+t)] × n</code></div>
        </div>
        <div class="fx">
          <div class="fx-t">浓度 · 折算 · 排放</div>
          <div class="fx-l"><code>C = (g2 − g1) / Vnd × 10⁶</code></div>
          <div class="fx-l"><code>α = 21/(21 − O₂实测)；αs = 21/(21 − O₂基准)</code></div>
          <div class="fx-l"><code>Cα = C × α/αs × 出力系数</code></div>
          <div class="fx-l"><code>Qs = Vs × F × 3600</code></div>
          <div class="fx-l"><code>Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)</code></div>
          <div class="fx-l"><code>G = C × Qn × 10⁻⁶</code></div>
        </div>
        <ul class="notes">
          <li><b>静压二选一</b>：填「平均静压」即按实测取用；不填则由「全压 + 动压 + 皮托管系数」反算（Ps = Pt − Hd/1000 × Kp²），两者不做隐式串联。</li>
          <li><b>含湿量口径</b>：Xsw 统一按百分数数值填入（如 7.89 表示 7.89%），干基折算因子统一为 (1 − Xsw/100)。</li>
          <li><b>标态温度</b>：统一取 273.15 K（0℃），原表中 273 K 与 273.15 K 混用产生的体积差约 0.02%。</li>
          <li><b>干湿基口径</b>：标况采样体积默认湿基（与 ZR-3260D 报表一致）；勾选开关后按 GB/T 16157 干基折算，便于与标准限值口径对齐。</li>
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
.bar-t { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; min-width: 0; }
.bar-t b { font-size: 17px; font-weight: 600; letter-spacing: 0.3px; }
.bar-s { font-size: 12.5px; color: var(--d-muted); }
.bar-s .hl { color: var(--d-accent2); font-size: 13.5px; }
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
}
.ghost:hover { border-color: var(--d-accent); color: var(--d-txt); }
.ghost.danger:hover { border-color: var(--d-err); color: var(--d-err); }

.prog { height: 3px; background: #1c2530; }
.prog-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--d-accent), var(--d-accent2));
  transition: width 0.25s ease;
}

/* ---- 主体两栏 ---- */
.body {
  display: grid;
  grid-template-columns: minmax(300px, 420px) 1fr;
  gap: 0;
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

/* ---- 输入分组 ---- */
.grp { margin-bottom: 18px; }
.grp-h {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; letter-spacing: 0.8px;
  color: var(--d-accent);
  text-transform: uppercase;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--d-line);
}
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

/* ---- 快捷赋值 ---- */
.quick { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
.qbtn {
  background: transparent;
  border: 1px dashed var(--d-line);
  color: var(--d-muted);
  border-radius: 7px;
  padding: 6px 11px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.qbtn:hover { border-color: var(--d-accent); color: var(--d-accent); }

/* ---- 口径开关 ---- */
.switch { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; user-select: none; }
.switch input { display: none; }
.sw-box {
  width: 38px; height: 21px; border-radius: 11px;
  background: var(--d-panel2); border: 1px solid var(--d-line);
  position: relative; flex: none; margin-top: 2px;
  transition: all 0.18s;
}
.sw-box::after {
  content: ""; position: absolute; left: 2px; top: 2px;
  width: 15px; height: 15px; border-radius: 50%;
  background: var(--d-muted);
  transition: all 0.18s;
}
.switch input:checked + .sw-box { background: rgba(79, 195, 247, 0.2); border-color: var(--d-accent); }
.switch input:checked + .sw-box::after { left: 19px; background: var(--d-accent); }
.sw-txt { font-size: 12.5px; color: var(--d-muted); line-height: 1.5; }
.sw-txt b { color: var(--d-txt); }
.sw-txt i { font-style: normal; color: var(--d-dim); font-size: 11.5px; }

/* ---- 结果区 ---- */
.res-grp { margin-bottom: 18px; }
.res-h {
  font-size: 11.5px; letter-spacing: 0.9px; text-transform: uppercase;
  color: var(--d-dim);
  margin-bottom: 9px;
}
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
.r-u { font-size: 11.5px; color: var(--d-muted); flex: none; white-space: nowrap; }
.r-v b.sm { font-size: 16px; }
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
  .bar { padding: 13px 14px 10px; }
  .bar-t b { font-size: 15.5px; }
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
}
</style>
