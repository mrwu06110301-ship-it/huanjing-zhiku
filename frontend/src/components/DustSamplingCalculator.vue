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

/* ============ 通用 select 字段（体积计算的折算方法） ============ */
function onSelect(mId: string, key: string, e: Event) {
  const el = e.target as HTMLSelectElement;
  const v = el.value;
  forms[mId][key] = v === "" ? null : Number(v);
  computeAndFill();
}

/* ============ 输入处理：允许负号，非法字符过滤 ============ */
function onInput(mId: string, key: string, e: Event) {
  const el = e.target as HTMLInputElement;
  const clean = el.value.replace(/[^0-9.\-]/g, "");
  el.value = clean;
  touched[mId]?.add(key);
  derived[mId]?.delete(key);
  markMeasured(mId, key);
  if (clean === "" || clean === "-" || clean === ".") {
    forms[mId][key] = null;
    computeAndFill();
    return;
  }
  const n = parseFloat(clean);
  forms[mId][key] = Number.isFinite(n) ? n : null;
  computeAndFill();
}

/* ============ 计算 ============ */
interface ModeResult {
  values: Record<string, number | null>;
  notes: Record<string, string | undefined>;
  steps: string[];
  /** 结果回填映射：{ 结果key: 输入框key } */
  fills?: Record<string, string>;
}

const results = computed<Record<string, ModeResult>>(() => {
  const out: Record<string, ModeResult> = {};
  for (const m of DUST_MODES) {
    try {
      out[m.id] = m.compute(forms[m.id] ?? {}, { measured: measuredOf(m.id), derived: derivedList(m.id) });
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

/* ============ 结果回填到输入框（输入框即显示） ============
 * 某些模式（如烟气静压计算）的输出本身就是另一个输入项，
 * 此时把结果直接回填到对应输入框，输入框本身即显示结果。
 *
 * 实现：输入变化 → 计算 → 回填 → 再计算（最多迭代 3 轮，收敛即停）。
 * 不使用 watch，避免自触发形成死循环。
 *
 * 规则：
 *   - 只有当目标输入框在本模式确实存在时才回填（否则结果无处显示，保留在右侧）
 *   - 用户手动填过的字段不被回填覆盖（实测优先）
 */
const FILL_DIGITS: Record<string, number> = {
  ps: 4, pt: 4, dpPressure: 4,
  nozzle: 2, vs: 3, qrs: 2, vnd: 2, qn: 0, qs: 0,
  volumeCondition: 2, volumeMeter: 2,
};

const MAX_FILL_ROUNDS = 3;

/** 用户手动输入过的字段（不参与回填覆盖） */
const touched: Record<string, Set<string>> = {};
for (const m of DUST_MODES) touched[m.id] = new Set();

/** 由计算派生出来的字段（不是用户实测值） */
const derived: Record<string, Set<string>> = {};
for (const m of DUST_MODES) derived[m.id] = new Set();

function derivedList(mId: string): string[] {
  return derived[mId] ? Array.from(derived[mId]) : [];
}

/**
 * 每个模式的「实测基准」标记（'ps' 或 'pt'）
 *
 * 全压↔静压双向互转的关键：用户最后手动编辑的是哪一个，
 * 另一个就由它派生并回填。若无标记，默认以静压为实测。
 */
const measured: Record<string, string | null> = {};
for (const m of DUST_MODES) measured[m.id] = null;

function measuredOf(mId: string): string | null {
  return measured[mId] ?? null;
}

/** 记录实测基准（用户手动编辑全压/静压时调用） */
function markMeasured(mId: string, key: string) {
  if (key !== "ps" && key !== "pt") return;
  measured[mId] = key;
  // 全压↔静压互转：用户改了这一个，另一个就变成派生值
  // （解除它的「实测」身份，允许被重新推算覆盖）
  const other = key === "ps" ? "pt" : "ps";
  touched[mId]?.delete(other);
  derived[mId]?.add(other);
}

/** 计算当前模式并把结果回填到输入框（迭代至收敛） */
function computeAndFill() {
  for (let round = 0; round < MAX_FILL_ROUNDS; round++) {
    const r = results.value[modeId.value];
    if (!r?.fills) return;
    const f = forms[modeId.value];
    if (!f) return;
    const t = touched[modeId.value];
    const d = derived[modeId.value];
    let changed = false;
    for (const [resKey, fieldKey] of Object.entries(r.fills)) {
      const val = r.values[resKey];
      if (val === null || val === undefined || !Number.isFinite(val)) continue;
      if (!(fieldKey in f)) continue;
      if (t?.has(fieldKey)) continue;
      const digits = FILL_DIGITS[resKey] ?? 4;
      const next = digits === 0 ? Math.round(val) : Number(val.toFixed(digits));
      if (f[fieldKey] !== next) {
        f[fieldKey] = next;
        d?.add(fieldKey);
        changed = true;
      }
    }
    if (!changed) return;
  }
}

/* ============ 已在输入框显示的结果（右侧不再重复列出） ============
 * 判定：结果对应的输入框在本模式存在，且该输入框当前确实有值。
 * 这样：
 *   - 已算出并回填 → 右侧不重复（输入框即显示）
 *   - 算不出（输入框仍空）→ 保留右侧，显示「缺 xxx」提示
 */
const shownResults = computed<Set<string>>(() => {
  const set = new Set<string>();
  const f = forms[modeId.value] ?? {};
  const r = curResult.value;
  const fills = r?.fills ?? {};
  for (const d of mode.value.results) {
    const target = fills[d.key] ?? (d.key in f ? d.key : null);
    if (!target) continue;
    const val = f[target];
    if (val === null || val === undefined) continue;
    set.add(d.key);
  }
  return set;
});

/* ============ 被计算值填充的输入框（标「计算值」） ============ */
const filledFields = computed<Set<string>>(() => {
  const set = new Set<string>();
  const r = curResult.value;
  if (!r?.fills) return set;
  const fieldKeys = new Set(mode.value.fields.map((f) => f.key));
  const t = touched[modeId.value];
  for (const [resKey, fieldKey] of Object.entries(r.fills)) {
    if (!fieldKeys.has(fieldKey)) continue;
    if (t?.has(fieldKey)) continue;
    const val = r.values[resKey];
    if (val === null || val === undefined || !Number.isFinite(val)) continue;
    set.add(fieldKey);
  }
  return set;
});

/** 结果区显示项：排除已在输入框显示的结果 */
const visibleResults = computed(() =>
  mode.value.results.filter((d) => !shownResults.value.has(d.key))
);

/* ============ 缺失依赖说明 ============
 * 统一走 flue-dust-modes.ts 的中央依赖表，平台与小程序口径一致 */
function missingOf(m: DustMode, key: string): string {
  return missingOfResult(key, forms[m.id] ?? {}, curResult.value?.values ?? {}, m.depRules);
}

/* ============ 公式说明（随模式 + 所选方法同步） ============ */
const curFormulas = computed(() => {
  const m = mode.value;
  const byMethod = m.formulasByMethod;
  if (!byMethod) return m.formulas;
  const sel = curForm.value?.method;
  const hit = sel === null || sel === undefined
    ? null
    : byMethod[String(sel)];
  return hit ?? m.formulas;
});

/* ============ 操作 ============ */
function loadDemo() {
  const demo = DUST_MODE_DEMO[modeId.value] ?? {};
  const f = forms[modeId.value];
  for (const key of Object.keys(f)) f[key] = demo[key] ?? null;
  o2BaseCustom[modeId.value] = false;
  touched[modeId.value]?.clear();
  derived[modeId.value]?.clear();
  // 示例数据的实测基准：给了全压就以全压为准，否则以静压为准
  measured[modeId.value] = demo.pt !== null && demo.pt !== undefined ? "pt"
    : (demo.ps !== null && demo.ps !== undefined ? "ps" : null);
  computeAndFill();
  ElMessage.success("已填入示例数据");
}

function clearAll() {
  const f = forms[modeId.value];
  for (const key of Object.keys(f)) f[key] = null;
  o2BaseCustom[modeId.value] = false;
  touched[modeId.value]?.clear();
  derived[modeId.value]?.clear();
  measured[modeId.value] = null;
  computeAndFill();
  ElMessage.info("已清空");
}

function switchMode(id: string) {
  modeId.value = id;
  computeAndFill();
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
          <div class="flds">
            <div
              v-for="f in mode.fields"
              :key="f.key"
              :class="['fld', { filled: filledFields.has(f.key) }]"
            >
              <label>
                <span class="lbl">{{ f.label }}</span>
                <span class="sym">{{ f.sym }}</span>
                <span v-if="filledFields.has(f.key)" class="calc-tag">计算值</span>
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
              <div v-else-if="f.type === 'select'" class="wrap">
                <select
                  class="sel"
                  :value="curForm[f.key] === null ? '' : String(curForm[f.key])"
                  @change="onSelect(modeId, f.key, $event)"
                >
                  <option value="">请选择…</option>
                  <option v-for="o in f.options" :key="String(o.value)" :value="String(o.value)">
                    {{ o.label }}
                  </option>
                </select>
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
              v-for="d in visibleResults"
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
          <div class="fx-t">{{ mode.name }}</div>
          <div class="fx-l fx-desc">{{ mode.desc }}</div>
        </div>
        <div class="fx" v-for="(f, i) in curFormulas" :key="i">
          <div class="fx-t">{{ f.title }}</div>
          <div class="fx-l" v-for="(line, j) in f.lines" :key="j"><code>{{ line }}</code></div>
        </div>
        <ul class="notes">
          <li><b>全压与静压可互相换算</b>：Pt = Ps + Δp·Kp²/1000。填任一即可，另一项自动推算（标「计算值」）；两者都填时以实测静压为准并给出推算全压。</li>
          <li><b>统一标态干基口径</b>：标况采样体积、颗粒物浓度、标干烟气流量、排放速率四项均按标态干基计算，始终保持 C × Qn × 10⁻⁶ ≡ G，与排放标准限值直接可比。</li>
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

/* ---- 计算值标记（结果已回填到输入框） ---- */
.fld.filled .wrap {
  border-color: rgba(102, 217, 168, 0.45);
  background: rgba(102, 217, 168, 0.06);
}
.fld.filled .inp { color: var(--d-accent2); }
.calc-tag {
  font-size: 10px;
  color: var(--d-accent2);
  border: 1px solid rgba(102, 217, 168, 0.4);
  border-radius: 4px;
  padding: 1px 5px;
  flex: none;
  align-self: center;
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
.fx-l.fx-desc {
  font-family: inherit;
  font-size: 12px;
  color: var(--d-muted);
  border-left-color: var(--d-accent2);
  line-height: 1.6;
}
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
